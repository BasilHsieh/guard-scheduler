import { useState, useEffect, useRef } from 'react'
import type { MonthSchedule, Guard, Post, PostId } from '../types'
import { getGuards, getPosts, getCalendar, getSchedule, saveSchedule } from '../store'
import { generateSchedule, applyTyphoonDay } from '../lib/scheduler'
import { validateSchedule, calcMonthlyHours, calcPostCounts, RULES, type Violation } from '../lib/validator'

const DOW = ['日', '一', '二', '三', '四', '五', '六']

const POST_COLORS: Record<PostId, string> = {
  A: 'bg-blue-100 text-blue-700',
  B: 'bg-indigo-100 text-indigo-700',
  C: 'bg-violet-100 text-violet-700',
  D: 'bg-cyan-100 text-cyan-700',
  E: 'bg-teal-100 text-teal-700',
  F: 'bg-orange-100 text-orange-700',
  G: 'bg-amber-100 text-amber-700',
}

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const total = new Date(year, month, 0).getDate()
  for (let d = 1; d <= total; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

interface Props {
  initialYear?: number
  initialMonth?: number
}

export default function SchedulePage({ initialYear, initialMonth }: Props) {
  const now = new Date()
  const [year, setYear] = useState(initialYear ?? now.getFullYear())
  const [month, setMonth] = useState(initialMonth ?? now.getMonth() + 1)
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null)
  const [guards, setGuards] = useState<Guard[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [editingCell, setEditingCell] = useState<{ date: string; guardId: string } | null>(null)
  const [editingHeader, setEditingHeader] = useState<string | null>(null)
  const [typhoonModal, setTyphoonModal] = useState<{
    selectedDate?: string
    action?: 'set' | 'cancel'
  } | null>(null)
  const [leaveModal, setLeaveModal] = useState<{
    date: string; guardId: string; postId: PostId
    step: 1 | 2; candidateId?: string
  } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const headerPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setGuards(getGuards())
    setPosts(getPosts())
  }, [])

  useEffect(() => {
    setSchedule(getSchedule(year, month))
  }, [year, month])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditingCell(null)
      }
      if (headerPopoverRef.current && !headerPopoverRef.current.contains(e.target as Node)) {
        setEditingHeader(null)
      }
    }
    if (editingCell || editingHeader) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingCell, editingHeader])

  function handleCellClick(date: string, guardId: string) {
    setEditingCell(prev =>
      prev?.date === date && prev?.guardId === guardId ? null : { date, guardId }
    )
    setEditingHeader(null)
  }

  function handlePostChange(date: string, guardId: string, postId: PostId | null) {
    if (!schedule) return
    const updated: MonthSchedule = {
      ...schedule,
      days: schedule.days.map(d => {
        if (d.date !== date) return d
        // If assigning a post that's taken by someone else on this day, swap them
        const existingHolder = d.assignments.find(a => a.postId === postId && a.guardId !== guardId)
        const currentPost = d.assignments.find(a => a.guardId === guardId)?.postId ?? null
        return {
          ...d,
          assignments: d.assignments.map(a => {
            if (a.guardId === guardId) return { ...a, postId }
            if (existingHolder && a.guardId === existingHolder.guardId) return { ...a, postId: currentPost }
            return a
          }),
        }
      }),
      updatedAt: new Date().toISOString(),
    }
    saveSchedule(updated)
    setSchedule(updated)
    setEditingCell(null)
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  function handleGenerate() {
    const calendar = getCalendar(year)
    const holidays = calendar?.holidays ?? []
    const result = generateSchedule(year, month, guards, posts, holidays)
    saveSchedule(result)
    setSchedule(result)
  }

  function handleTyphoon(date: string) {
    if (!schedule) return
    const updated: MonthSchedule = {
      ...schedule,
      days: schedule.days.map(d => d.date === date ? applyTyphoonDay(d, posts) : d),
      updatedAt: new Date().toISOString(),
    }
    saveSchedule(updated)
    setSchedule(updated)
    setEditingHeader(null)
    setTyphoonModal(null)
  }

  function handleExportCSV() {
    if (!schedule) return
    const header = ['姓名', ...days]
    const rows = activeGuards.map(guard => {
      const cells = days.map(date => {
        const daySchedule = schedule.days.find(d => d.date === date)
        const postId = daySchedule?.assignments.find(a => a.guardId === guard.id)?.postId ?? ''
        return postId ?? ''
      })
      return [guard.name, ...cells]
    })
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `排班_${year}${String(month).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleUntyphoon(date: string) {
    if (!schedule) return
    const updated: MonthSchedule = {
      ...schedule,
      days: schedule.days.map(d => {
        if (d.date !== date) return d
        return {
          ...d,
          isTyphoon: false,
          assignments: d.originalAssignments ?? d.assignments,
          originalAssignments: undefined,
        }
      }),
      updatedAt: new Date().toISOString(),
    }
    saveSchedule(updated)
    setSchedule(updated)
    setEditingHeader(null)
    setTyphoonModal(null)
  }

  // 找出可以換班的候選人：當天休息、且換進來不違反規則 1&2
  function findSwapCandidates(date: string, requesterId: string, postId: PostId): Guard[] {
    if (!schedule) return []
    const daySchedule = schedule.days.find(d => d.date === date)
    if (!daySchedule) return []

    return activeGuards.filter(g => {
      if (g.id === requesterId) return false
      // 當天必須休息
      const a = daySchedule.assignments.find(a => a.guardId === g.id)
      if (a?.postId) return false

      // 規則 1：連續上班不超過 6 天
      const daysBefore = schedule.days.filter(d => d.date < date).sort((a, b) => b.date.localeCompare(a.date))
      let consecutive = 0
      for (const d of daysBefore) {
        const prev = d.assignments.find(a => a.guardId === g.id)
        if (prev?.postId) consecutive++
        else break
      }
      if (consecutive >= 6) return false

      // 規則 2：前一天不能是同哨點
      const dayIdx = schedule.days.findIndex(d => d.date === date)
      if (dayIdx > 0) {
        const prevPost = schedule.days[dayIdx - 1].assignments.find(a => a.guardId === g.id)?.postId
        if (prevPost === postId) return false
      }

      return true
    })
  }

  // 找合法還班日：requesterId 當天休、candidateId 當天有班、requesterId 接進去不違規
  function findPaybackDays(requesterId: string, candidateId: string, afterDate: string): Array<{ date: string; postId: PostId }> {
    if (!schedule) return []
    return schedule.days
      .filter(d => d.date > afterDate)
      .flatMap(d => {
        const requesterA = d.assignments.find(a => a.guardId === requesterId)
        const candidateA = d.assignments.find(a => a.guardId === candidateId)
        if (requesterA?.postId || !candidateA?.postId) return []
        const payPostId = candidateA.postId

        // 同類型 + 同時數：A/B/C、D/E、F/G 各自一組
        const leavePost = posts.find(p => p.id === leaveModal!.postId)
        const payPost = posts.find(p => p.id === payPostId)
        if (!leavePost || !payPost) return []
        if (leavePost.hours !== payPost.hours) return []

        // 規則 1：還班者連續上班不超過 6 天
        const daysBefore = schedule.days.filter(x => x.date < d.date).sort((a, b) => b.date.localeCompare(a.date))
        let consecutive = 0
        for (const prev of daysBefore) {
          const a = prev.assignments.find(a => a.guardId === requesterId)
          if (a?.postId) consecutive++
          else break
        }
        if (consecutive >= 6) return []

        // 規則 2：前一天不能是同哨點
        const dayIdx = schedule.days.findIndex(x => x.date === d.date)
        if (dayIdx > 0) {
          const prevPost = schedule.days[dayIdx - 1].assignments.find(a => a.guardId === requesterId)?.postId
          if (prevPost === payPostId) return []
        }

        return [{ date: d.date, postId: payPostId }]
      })
  }

  function handleLeaveSwap(candidateId: string) {
    if (!leaveModal || !schedule) return
    // 步驟一完成：進入步驟二選還班日
    setLeaveModal({ ...leaveModal, step: 2, candidateId })
  }

  function handlePaybackSelect(paybackDate: string, paybackPostId: PostId) {
    if (!leaveModal?.candidateId || !schedule) return
    const { date, guardId, postId, candidateId } = leaveModal as Required<typeof leaveModal>

    const updated: MonthSchedule = {
      ...schedule,
      days: schedule.days.map(d => {
        // 請假日：requesterId 休，candidateId 上班
        if (d.date === date) {
          return {
            ...d,
            assignments: d.assignments.map(a => {
              if (a.guardId === guardId) return { ...a, postId: null }
              if (a.guardId === candidateId) return { ...a, postId }
              return a
            }),
          }
        }
        // 還班日：requesterId 上班，candidateId 休
        if (d.date === paybackDate) {
          return {
            ...d,
            assignments: d.assignments.map(a => {
              if (a.guardId === guardId) return { ...a, postId: paybackPostId }
              if (a.guardId === candidateId) return { ...a, postId: null }
              return a
            }),
          }
        }
        return d
      }),
      updatedAt: new Date().toISOString(),
    }
    saveSchedule(updated)
    setSchedule(updated)
    setLeaveModal(null)
  }

  const activeGuards = guards.filter(g => g.active)
  const days = getDaysInMonth(year, month)
  const violations: Violation[] = schedule ? validateSchedule(schedule, posts, activeGuards.map(g => g.id)) : []

  // 每人本月時數 & 極值（供 sticky 欄色標）
  const guardMonthlyHours = schedule
    ? activeGuards.map(g => ({ id: g.id, hours: calcMonthlyHours(g.id, schedule, posts) }))
    : []
  const hoursVals = guardMonthlyHours.map(x => x.hours).filter(h => h > 0)
  const maxHours = hoursVals.length ? Math.max(...hoursVals) : 0
  const minHours = hoursVals.length ? Math.min(...hoursVals) : 0

  function getViolation(date: string, guardId: string): Violation | undefined {
    return violations.find(v => v.date === date && v.guardId === guardId)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">排班</h2>
          <p className="text-base text-gray-500 mt-0.5">產生並調整每月排班</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition text-xl font-light">‹</button>
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-')
                setYear(Number(y))
                setMonth(Number(m))
              }}
              className="text-base font-semibold text-gray-800 border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-blue-400 transition"
            />
            <button onClick={nextMonth} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition text-xl font-light">›</button>
          </div>
          {schedule && (
            <>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 border border-gray-200 font-medium rounded-xl transition"
              >
                匯出 CSV
              </button>
              <button
                onClick={() => setTyphoonModal({})}
                className="px-4 py-2.5 text-sm text-gray-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 border border-gray-200 font-medium rounded-xl transition"
              >
                颱風假
              </button>
            </>
          )}
          <button
            onClick={handleGenerate}
            disabled={activeGuards.length === 0}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl transition shadow-sm"
          >
            產生排班
          </button>
        </div>
      </div>

      {activeGuards.length === 0 && (
        <div className="text-center py-20 text-base text-gray-400">請先至「人員」頁面新增保全人員</div>
      )}

      {activeGuards.length > 0 && !schedule && (
        <div className="text-center py-20 text-base text-gray-400">點擊「產生排班」自動產生本月排班</div>
      )}

      {schedule && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
          <table className="border-collapse w-full">
            <thead>
              {/* 日期列 */}
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 border-b-2 border-r border-gray-200 px-5 py-4 text-left text-base font-bold text-gray-600 min-w-28">
                  人員
                </th>
                {days.map(date => {
                  const daySchedule = schedule.days.find(d => d.date === date)
                  const dow = new Date(date).getDay()
                  const isWeekend = dow === 0 || dow === 6
                  const isHoliday = daySchedule?.isHoliday ?? false
                  const isTyphoon = daySchedule?.isTyphoon ?? false
                  const isOff = isHoliday || isWeekend
                  return (
                    <th
                      key={date}
                      className={`relative border-b-2 border-r border-gray-200 px-1 py-2 text-center min-w-[3.5rem] select-none ${
                        isTyphoon ? 'bg-red-50' : isOff ? 'bg-blue-50' : 'bg-gray-50'
                      }`}
                    >
                      <div className={`text-xs font-semibold tracking-wide ${isOff ? 'text-blue-400' : 'text-gray-400'}`}>
                        {DOW[dow]}
                      </div>
                      <div className={`text-base font-bold leading-tight mt-0.5 ${isTyphoon ? 'text-red-500' : isOff ? 'text-blue-600' : 'text-gray-700'}`}>
                        {parseInt(date.slice(8))}
                      </div>

                      {/* 颱風中顯示標記 */}
                      {isTyphoon && (
                        <div className="mt-0.5 text-xs font-bold text-red-400">颱</div>
                      )}
                    </th>
                  )
                })}
                <th className="sticky right-0 z-10 bg-gray-50 border-b-2 border-l border-gray-200 px-4 py-4 text-center text-sm font-bold text-gray-500 min-w-20 whitespace-nowrap">
                  本月時數
                </th>
              </tr>
            </thead>
            <tbody>
              {activeGuards.map((guard, gi) => (
                <tr key={guard.id} className={gi % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className={`sticky left-0 z-10 border-b border-r border-gray-200 px-5 py-4 text-base font-semibold text-gray-800 ${
                    gi % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                  }`}>
                    {guard.name}
                  </td>
                  {days.map(date => {
                    const daySchedule = schedule.days.find(d => d.date === date)
                    const assignment = daySchedule?.assignments.find(a => a.guardId === guard.id)
                    const postId = assignment?.postId ?? null
                    const dow = new Date(date).getDay()
                    const isWeekend = dow === 0 || dow === 6
                    const isOff = daySchedule?.isHoliday || isWeekend
                    const violation = getViolation(date, guard.id)

                    const isEditing = editingCell?.date === date && editingCell?.guardId === guard.id
                    const takenPosts = new Set(
                      daySchedule?.assignments.filter(a => a.guardId !== guard.id && a.postId !== null).map(a => a.postId)
                    )
                    const dayIsHoliday = daySchedule?.isHoliday ?? false
                    const availablePosts = posts.filter(p =>
                      dayIsHoliday ? p.type === 'holiday' : p.type === 'weekday'
                    )

                    return (
                      <td
                        key={date}
                        title={violation?.message}
                        className={`relative border-b border-r border-gray-100 px-1 py-3.5 text-center cursor-pointer transition-colors ${
                          violation ? 'bg-red-50' : isOff ? 'bg-blue-50/50' : ''
                        } ${isEditing ? 'ring-2 ring-inset ring-blue-400' : 'hover:bg-blue-50/30'}`}
                        onClick={() => handleCellClick(date, guard.id)}
                      >
                        {postId ? (
                          <span className={`inline-block text-sm font-bold px-2 py-1 rounded-lg ${
                            violation ? 'bg-red-200 text-red-700' : POST_COLORS[postId]
                          }`}>
                            {postId}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-gray-300">休</span>
                        )}

                        {isEditing && (
                          <div
                            ref={popoverRef}
                            className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 flex flex-col gap-0.5 min-w-[4rem]"
                            onClick={e => e.stopPropagation()}
                          >
                            {postId === null && (
                              <button
                                onClick={() => handlePostChange(date, guard.id, null)}
                                className="text-sm px-2 py-1.5 rounded-lg text-center font-medium transition bg-gray-100 text-gray-500"
                              >
                                休
                              </button>
                            )}
                            {availablePosts.map(p => (
                              <button
                                key={p.id}
                                onClick={() => handlePostChange(date, guard.id, p.id)}
                                className={`text-sm px-2 py-1.5 rounded-lg text-center font-bold transition ${
                                  postId === p.id
                                    ? POST_COLORS[p.id] + ' opacity-100'
                                    : takenPosts.has(p.id)
                                    ? POST_COLORS[p.id] + ' opacity-40'
                                    : POST_COLORS[p.id] + ' opacity-80 hover:opacity-100'
                                }`}
                              >
                                {p.id}
                                {takenPosts.has(p.id) && postId !== p.id && (
                                  <span className="ml-0.5 text-xs opacity-60">⇄</span>
                                )}
                              </button>
                            ))}
                            {postId && (
                              <>
                                <div className="my-0.5 border-t border-gray-100" />
                                <button
                                  onClick={() => {
                                    setEditingCell(null)
                                    setLeaveModal({ date, guardId: guard.id, postId, step: 1 })
                                  }}
                                  className="text-sm px-2 py-1.5 rounded-lg text-center font-medium text-orange-500 hover:bg-orange-50 transition"
                                >
                                  請假
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  {/* 本月時數 sticky 右欄 */}
                  {(() => {
                    const h = guardMonthlyHours.find(x => x.id === guard.id)?.hours ?? 0
                    const isMax = h === maxHours && maxHours !== minHours
                    const isMin = h === minHours && maxHours !== minHours
                    const bg = gi % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    return (
                      <td className={`sticky right-0 z-10 border-b border-l border-gray-200 px-4 py-4 text-center font-bold text-base whitespace-nowrap ${bg} ${
                        isMax ? 'text-red-500' : isMin ? 'text-green-600' : 'text-gray-700'
                      }`}>
                        {h > 0 ? `${h}h` : <span className="text-gray-300">-</span>}
                      </td>
                    )
                  })()}
                </tr>
              ))}
              {/* 平均時數列 */}
              {hoursVals.length > 0 && (() => {
                const total = hoursVals.reduce((a, b) => a + b, 0)
                const avg = Math.round(total / hoursVals.length)
                return (
                  <tr className="bg-gray-50">
                    <td colSpan={days.length + 1} className="border-t-2 border-gray-200" />
                    <td className="sticky right-0 z-10 bg-gray-50 border-t-2 border-l border-gray-200 px-4 py-3 text-center whitespace-nowrap">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">平均</div>
                      <div className="text-lg font-bold text-gray-700 mt-0.5">{avg}h</div>
                      <div className="mt-2 flex flex-col gap-0.5 items-center">
                        <span className="text-xs font-medium text-red-400">▲ 最高</span>
                        <span className="text-xs font-medium text-green-600">▼ 最低</span>
                      </div>
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* 颱風假 Modal（月曆選日） */}
      {typhoonModal !== null && schedule && (() => {
        const calendar = getCalendar(year)
        const holidays = calendar?.holidays ?? []
        const firstDow = new Date(year, month - 1, 1).getDay()
        const blanks = Array(firstDow).fill(null)
        const { selectedDate, action } = typhoonModal

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setTyphoonModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-[22rem] overflow-hidden" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <p className="text-base font-bold text-gray-900">颱風假</p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {year} 年 {month} 月 · 點選平日設定或取消
                  </p>
                </div>
                <button
                  onClick={() => setTyphoonModal(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition text-lg leading-none"
                >
                  ×
                </button>
              </div>

              {/* Calendar grid */}
              <div className="px-4 pt-3 pb-2">
                {/* Weekday labels */}
                <div className="grid grid-cols-7 mb-1">
                  {['日','一','二','三','四','五','六'].map((d, i) => (
                    <div key={d} className={`text-center text-xs font-semibold py-1.5 ${i === 0 || i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Date cells */}
                <div className="grid grid-cols-7 gap-0.5">
                  {blanks.map((_, i) => <div key={`b${i}`} />)}
                  {days.map(date => {
                    const ds = schedule.days.find(d => d.date === date)
                    const dow = new Date(date).getDay()
                    const isWeekendDay = dow === 0 || dow === 6
                    const isHolidayDay = ds?.isHoliday || holidays.includes(date)
                    const isOff = isWeekendDay || isHolidayDay
                    const isTyphoon = ds?.isTyphoon ?? false
                    const dayNum = parseInt(date.slice(8))
                    const isSelected = selectedDate === date

                    if (isTyphoon) {
                      // Red — click to select for cancellation
                      return (
                        <button
                          key={date}
                          onClick={() => setTyphoonModal({ selectedDate: date, action: 'cancel' })}
                          className={`aspect-square flex items-center justify-center rounded-lg text-sm font-bold transition ${
                            isSelected && action === 'cancel'
                              ? 'bg-red-500 text-white ring-2 ring-red-300'
                              : 'bg-red-100 text-red-500 hover:bg-red-200'
                          }`}
                          title="點擊取消颱風假"
                        >
                          {dayNum}
                        </button>
                      )
                    }

                    if (isOff) {
                      // Greyed out — not applicable
                      return (
                        <div key={date} className="aspect-square flex items-center justify-center">
                          <span className="text-sm text-gray-200">{dayNum}</span>
                        </div>
                      )
                    }

                    // Weekday — clickable to set typhoon
                    return (
                      <button
                        key={date}
                        onClick={() => setTyphoonModal({ selectedDate: date, action: 'set' })}
                        className={`aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition ${
                          isSelected && action === 'set'
                            ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                            : 'text-gray-700 hover:bg-amber-50 hover:text-amber-700'
                        }`}
                      >
                        {dayNum}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Confirm panel — shows when a date is selected */}
              {selectedDate && action ? (
                <div className="px-4 pb-4">
                  <div className={`rounded-xl px-4 py-3 mb-3 text-sm space-y-1 ${
                    action === 'cancel'
                      ? 'bg-gray-50 text-gray-600 border border-gray-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-100'
                  }`}>
                    <p className="font-semibold mb-1.5">
                      {selectedDate.slice(5).replace('-', '/')} ·{' '}
                      {action === 'cancel' ? '取消颱風假，還原原始排班' : '設定為颱風假'}
                    </p>
                    {action === 'set' && (
                      <>
                        <p className="text-amber-700">· D、E 人員改上 <strong>F、G</strong> 班</p>
                        <p className="text-amber-700">· A、B、C 人員當日休假</p>
                        <p className="text-xs text-amber-500 pt-1">可隨時取消還原原始排班</p>
                      </>
                    )}
                    {action === 'cancel' && (
                      <p className="text-gray-500">原始排班將被還原</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTyphoonModal({})}
                      className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
                    >
                      重新選擇
                    </button>
                    <button
                      onClick={() => action === 'set' ? handleTyphoon(selectedDate) : handleUntyphoon(selectedDate)}
                      className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition ${
                        action === 'cancel'
                          ? 'bg-gray-500 hover:bg-gray-600'
                          : 'bg-amber-500 hover:bg-amber-600'
                      }`}
                    >
                      {action === 'cancel' ? '確定取消' : '確定設定'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-4 pb-4 pt-1">
                  <div className="flex items-center gap-3 text-xs text-gray-400 px-1 mb-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-amber-100 inline-block" />
                      點選設定
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-red-100 inline-block" />
                      已設定（點選取消）
                    </span>
                  </div>
                </div>
              )}

            </div>
          </div>
        )
      })()}

      {/* 請假換班 Modal */}
      {leaveModal && (() => {
        const requester = activeGuards.find(g => g.id === leaveModal.guardId)
        const candidate = leaveModal.candidateId ? activeGuards.find(g => g.id === leaveModal.candidateId) : null
        const dateLabel = leaveModal.date.slice(5).replace('-', '/')

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setLeaveModal(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-80 overflow-hidden" onClick={e => e.stopPropagation()}>

              {/* 步驟指示 */}
              <div className="px-5 pt-5 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  {([1, 2] as const).map(s => (
                    <div key={s} className="flex items-center gap-1.5">
                      <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                        leaveModal.step === s ? 'bg-orange-500 text-white' : leaveModal.step > s ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                      }`}>{leaveModal.step > s ? '✓' : s}</span>
                      <span className={`text-sm ${leaveModal.step === s ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                        {s === 1 ? '選換班對象' : '選還班日'}
                      </span>
                      {s === 1 && <span className="text-gray-300 text-sm">›</span>}
                    </div>
                  ))}
                </div>
                <p className="text-base font-semibold text-gray-800">
                  {dateLabel} · {requester?.name} 請假
                  {leaveModal.step === 2 && candidate && (
                    <span className="text-gray-400 font-normal text-sm ml-1">（{candidate.name} 代班）</span>
                  )}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {leaveModal.step === 1
                    ? <>選擇換班對象，對方補上{' '}
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-sm ${POST_COLORS[leaveModal.postId]}`}>
                          {leaveModal.postId}
                        </span>
                      </>
                    : `選擇還班日，你幫 ${candidate?.name} 上班`
                  }
                </p>
              </div>

              {/* 內容區 */}
              <div className="px-3 py-2 max-h-60 overflow-y-auto">
                {leaveModal.step === 1 ? (() => {
                  const candidates = findSwapCandidates(leaveModal.date, leaveModal.guardId, leaveModal.postId)
                  return candidates.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-4">目前沒有合法的換班對象</p>
                    : <ul className="space-y-1">
                        {candidates.map(c => (
                          <li key={c.id}>
                            <button
                              onClick={() => handleLeaveSwap(c.id)}
                              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-orange-50 transition flex items-center justify-between group"
                            >
                              <span className="text-sm font-medium text-gray-700">{c.name}</span>
                              <span className="text-sm text-orange-400 opacity-0 group-hover:opacity-100 transition">選擇 →</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                })() : (() => {
                  const paybacks = findPaybackDays(leaveModal.guardId, leaveModal.candidateId!, leaveModal.date)
                  return paybacks.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-4">本月無合法還班日</p>
                    : <ul className="space-y-1">
                        {paybacks.map(({ date, postId }) => (
                          <li key={date}>
                            <button
                              onClick={() => handlePaybackSelect(date, postId)}
                              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-green-50 transition flex items-center justify-between group"
                            >
                              <span className="text-sm font-medium text-gray-700">
                                {date.slice(5).replace('-', '/')}
                              </span>
                              <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-sm ${POST_COLORS[postId]}`}>
                                {postId}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                })()}
              </div>

              <div className="px-3 pb-4 flex gap-2">
                {leaveModal.step === 2 && (
                  <button
                    onClick={() => setLeaveModal({ ...leaveModal, step: 1, candidateId: undefined })}
                    className="flex-1 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-xl transition"
                  >
                    ← 上一步
                  </button>
                )}
                <button
                  onClick={() => setLeaveModal(null)}
                  className="flex-1 py-2 text-sm text-gray-400 hover:bg-gray-50 rounded-xl transition"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 下方統計區 */}
      {schedule && (
        <div className="mt-6 grid grid-cols-2 gap-6">

          {/* 規則檢查 */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">規則檢查</p>
            </div>
            <ul className="divide-y divide-gray-100">
              {RULES.map(({ type, label }) => {
                const matched = violations.filter(v => v.type === type)
                const pass = matched.length === 0
                return (
                  <li key={type}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${pass ? 'text-green-500' : 'text-red-500'}`}>
                          {pass ? '✓' : '✗'}
                        </span>
                        <span className="text-sm text-gray-700">{label}</span>
                      </div>
                      {!pass && (
                        <span className="text-sm font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                          {matched.length} 筆
                        </span>
                      )}
                    </div>
                    {!pass && (
                      <ul className="bg-red-50/50 border-t border-red-100">
                        {matched.map((v, i) => {
                          const guard = guards.find(g => g.id === v.guardId)
                          return (
                            <li key={i} className="px-6 py-2 flex items-center justify-between">
                              <span className="text-sm text-red-600 font-medium">{guard?.name}</span>
                              <span className="text-sm text-red-400">
                                {v.date ? `${v.date.slice(5).replace('-', '/')} · ` : ''}{v.message}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {/* 班別統計 */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">班別統計</p>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-sm text-gray-500 font-medium border-b border-gray-100">人員</th>
                  {(['A','B','C','D','E','F','G'] as PostId[]).map(p => (
                    <th key={p} className="px-2 py-2.5 text-center border-b border-gray-100">
                      <span className={`px-1.5 py-0.5 rounded text-sm font-semibold ${POST_COLORS[p]}`}>{p}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center text-sm text-gray-500 font-medium border-b border-gray-100">時數</th>
                </tr>
              </thead>
              <tbody>
                {activeGuards.map((guard, gi) => {
                  const counts = calcPostCounts(guard.id, schedule)
                  const hours = calcMonthlyHours(guard.id, schedule, posts)
                  return (
                    <tr key={guard.id} className={gi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-700 border-b border-gray-100">{guard.name}</td>
                      {(['A','B','C','D','E','F','G'] as PostId[]).map(p => (
                        <td key={p} className="px-2 py-2.5 text-center text-sm border-b border-gray-100 text-gray-600">
                          {counts[p] > 0 ? counts[p] : <span className="text-gray-200">-</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center text-sm border-b border-gray-100 font-semibold text-gray-700">{hours}h</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  )
}
