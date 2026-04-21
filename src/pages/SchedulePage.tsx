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
  const popoverRef = useRef<HTMLDivElement>(null)

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
    }
    if (editingCell) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingCell])

  function handleCellClick(date: string, guardId: string) {
    setEditingCell(prev =>
      prev?.date === date && prev?.guardId === guardId ? null : { date, guardId }
    )
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
    if (!window.confirm(`確定取消 ${date.slice(5).replace('-', '/')} 的颱風假？將還原原始排班。`)) return
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">排班</h2>
          <p className="text-sm text-gray-500">產生並調整每月排班</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition">‹</button>
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-')
                setYear(Number(y))
                setMonth(Number(m))
              }}
              className="text-sm font-semibold text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400 transition"
            />
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition">›</button>
          </div>
          {schedule && (
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 border border-gray-200 font-medium rounded-lg transition"
            >
              匯出 CSV
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={activeGuards.length === 0}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg transition"
          >
            產生排班
          </button>
        </div>
      </div>

      {activeGuards.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">請先至「人員」頁面新增保全人員</div>
      )}

      {activeGuards.length > 0 && !schedule && (
        <div className="text-center py-16 text-sm text-gray-400">點擊「產生排班」自動產生本月排班</div>
      )}


      {schedule && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="border-collapse w-full">
            <thead>
              {/* 日期列 */}
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-500 min-w-24">
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
                      className={`border-b border-r border-gray-200 px-1 py-2 text-center min-w-14 ${
                        isTyphoon ? 'bg-red-50' : isOff ? 'bg-blue-50' : 'bg-gray-50'
                      }`}
                    >
                      <div className={`text-xs font-medium ${isOff ? 'text-blue-500' : 'text-gray-400'}`}>
                        {DOW[dow]}
                      </div>
                      <div className={`text-sm font-bold ${isTyphoon ? 'text-red-500' : isOff ? 'text-blue-600' : 'text-gray-700'}`}>
                        {parseInt(date.slice(8))}
                      </div>
                      {isTyphoon && <div className="text-[9px] text-red-400">颱風</div>}
                    </th>
                  )
                })}
                <th className="sticky right-0 z-10 bg-gray-50 border-b border-l border-gray-200 px-3 py-2 text-center text-xs font-semibold text-gray-500 min-w-16 whitespace-nowrap">
                  本月時數
                </th>
              </tr>
            </thead>
            {/* 颱風假操作列 */}
            <tbody>
              <tr className="bg-gray-50 border-b border-gray-200">
                <td className="sticky left-0 z-10 bg-gray-50 border-r border-gray-200 px-4 py-2 text-xs font-semibold text-gray-400 whitespace-nowrap">
                  颱風假
                </td>
                {days.map(date => {
                  const daySchedule = schedule.days.find(d => d.date === date)
                  const isTyphoon = daySchedule?.isTyphoon ?? false
                  return (
                    <td key={date} className="border-r border-gray-100 px-1 py-2 text-center">
                      {isTyphoon ? (
                        <button
                          onClick={() => handleUntyphoon(date)}
                          className="text-[10px] font-semibold bg-red-100 text-red-500 hover:bg-red-200 px-1.5 py-0.5 rounded transition"
                        >
                          取消
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTyphoon(date)}
                          className="text-[10px] font-medium text-gray-300 hover:bg-orange-100 hover:text-orange-500 px-1.5 py-0.5 rounded transition"
                        >
                          設定
                        </button>
                      )}
                    </td>
                  )
                })}
                <td className="sticky right-0 z-10 bg-gray-50 border-l border-gray-200" />
              </tr>

              {activeGuards.map((guard, gi) => (
                <tr key={guard.id} className={gi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className={`sticky left-0 z-10 border-b border-r border-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 ${
                    gi % 2 === 0 ? 'bg-white' : 'bg-gray-50'
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
                        className={`relative border-b border-r border-gray-100 px-1 py-2 text-center cursor-pointer ${
                          violation ? 'bg-red-50' : isOff ? 'bg-blue-50/40' : ''
                        } ${isEditing ? 'ring-2 ring-inset ring-blue-400' : 'hover:bg-gray-50'}`}
                        onClick={() => handleCellClick(date, guard.id)}
                      >
                        {postId ? (
                          <span className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded ${
                            violation ? 'bg-red-200 text-red-700' : POST_COLORS[postId]
                          }`}>
                            {postId}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">休</span>
                        )}

                        {isEditing && (
                          <div
                            ref={popoverRef}
                            className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 flex flex-col gap-0.5 min-w-16"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handlePostChange(date, guard.id, null)}
                              className={`text-xs px-2 py-1 rounded-lg text-center font-medium transition ${
                                postId === null ? 'bg-gray-100 text-gray-500' : 'text-gray-400 hover:bg-gray-100'
                              }`}
                            >
                              休
                            </button>
                            {availablePosts.map(p => (
                              <button
                                key={p.id}
                                onClick={() => handlePostChange(date, guard.id, p.id)}
                                className={`text-xs px-2 py-1 rounded-lg text-center font-bold transition ${
                                  postId === p.id
                                    ? POST_COLORS[p.id] + ' opacity-100'
                                    : takenPosts.has(p.id)
                                    ? POST_COLORS[p.id] + ' opacity-40'
                                    : POST_COLORS[p.id] + ' opacity-80 hover:opacity-100'
                                }`}
                              >
                                {p.id}
                                {takenPosts.has(p.id) && postId !== p.id && (
                                  <span className="ml-0.5 text-[9px] opacity-60">⇄</span>
                                )}
                              </button>
                            ))}
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
                    const bg = gi % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    return (
                      <td className={`sticky right-0 z-10 border-b border-l border-gray-200 px-3 py-2 text-center font-semibold text-sm whitespace-nowrap ${bg} ${
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
                  <tr>
                    <td colSpan={days.length + 1} className="border-t border-gray-200" />
                    <td className="sticky right-0 z-10 bg-gray-50 border-t border-l border-gray-200 px-3 py-2 text-center whitespace-nowrap">
                      <div className="text-[10px] text-gray-400 leading-tight">平均</div>
                      <div className="text-sm font-bold text-gray-600">{avg}h</div>
                      <div className="mt-1.5 flex flex-col gap-0.5 items-center">
                        <span className="text-[9px] text-red-400 leading-tight">▲ 最高</span>
                        <span className="text-[9px] text-green-600 leading-tight">▼ 最低</span>
                      </div>
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      )}

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
                        <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
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
                              <span className="text-xs text-red-600 font-medium">{guard?.name}</span>
                              <span className="text-xs text-red-400">
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
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-gray-500 font-medium border-b border-gray-100">人員</th>
                  {(['A','B','C','D','E','F','G'] as PostId[]).map(p => (
                    <th key={p} className="px-2 py-2 text-center border-b border-gray-100">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${POST_COLORS[p]}`}>{p}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center text-gray-500 font-medium border-b border-gray-100">時數</th>
                </tr>
              </thead>
              <tbody>
                {activeGuards.map((guard, gi) => {
                  const counts = calcPostCounts(guard.id, schedule)
                  const hours = calcMonthlyHours(guard.id, schedule, posts)
                  return (
                    <tr key={guard.id} className={gi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5 font-medium text-gray-700 border-b border-gray-100">{guard.name}</td>
                      {(['A','B','C','D','E','F','G'] as PostId[]).map(p => (
                        <td key={p} className="px-2 py-2.5 text-center border-b border-gray-100 text-gray-600">
                          {counts[p] > 0 ? counts[p] : <span className="text-gray-200">-</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center border-b border-gray-100 font-semibold text-gray-700">{hours}h</td>
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
