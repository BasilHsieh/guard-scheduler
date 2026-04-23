import { useState, useEffect } from 'react'
import type { MonthSchedule, Guard, Post, PostId, SwapRequest } from '../types'
import {
  getGuards,
  getPosts,
  getCalendar,
  getSchedule,
  saveSchedule,
  getSwapRequests,
  appendSwapRequest,
} from '../store'
import { generateSchedule, applyTyphoonDay } from '../lib/scheduler'
import {
  validateSchedule,
  calcMonthlyHours,
  calcPostCounts,
  calcRuleStats,
  RULES,
  type Violation,
  type RuleStats,
} from '../lib/validator'
import SwapRequestModal from '../components/SwapRequestModal'
import SwapRequestList from '../components/SwapRequestList'

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
  const [swapRequests, setSwapRequestsState] = useState<SwapRequest[]>([])
  const [typhoonModal, setTyphoonModal] = useState<{
    selectedDate?: string
    action?: 'set' | 'cancel'
  } | null>(null)
  const [swapModalOpen, setSwapModalOpen] = useState(false)

  useEffect(() => {
    setGuards(getGuards())
    setPosts(getPosts())
  }, [])

  useEffect(() => {
    setSchedule(getSchedule(year, month))
    setSwapRequestsState(getSwapRequests(year, month))
  }, [year, month])

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
    setTyphoonModal(null)
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
    setTyphoonModal(null)
  }

  function handleSwapApplied(newSchedule: MonthSchedule, record: SwapRequest) {
    saveSchedule(newSchedule)
    setSchedule(newSchedule)
    appendSwapRequest(record)
    setSwapRequestsState(getSwapRequests(record.year, record.month))
    setSwapModalOpen(false)
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

  const activeGuards = guards.filter(g => g.active)
  const days = getDaysInMonth(year, month)
  const violations: Violation[] = schedule ? validateSchedule(schedule, posts, activeGuards.map(g => g.id)) : []
  const ruleStats: RuleStats | null = schedule ? calcRuleStats(schedule, posts, activeGuards.map(g => g.id)) : null
  const calendar = getCalendar(year)
  const holidays = calendar?.holidays ?? []

  function ruleStatLine(type: Violation['type']): string | null {
    if (!ruleStats) return null
    switch (type) {
      case 'consecutive_days':
        return `本月最長連續上班 ${ruleStats.consecutiveDaysMax} 天`
      case 'consecutive_post':
        return `連續同哨點 ${ruleStats.consecutivePostViolations} 次，共檢查 ${ruleStats.consecutivePostChecks} 組相鄰上班日`
      case 'holiday_day_alternation':
        return `假日星期未交替 ${ruleStats.holidayDayAlternationViolations} 次，共檢查 ${ruleStats.holidayDayAlternationChecks} 次假日銜接`
      case 'holiday_post_alternation':
        return `假日哨點未交替 ${ruleStats.holidayPostAlternationViolations} 次，共檢查 ${ruleStats.holidayPostAlternationChecks} 次假日銜接`
      case 'hours_imbalance':
        return `工時差距 ${ruleStats.hoursSpread} 小時（最高 ${ruleStats.hoursMax}、最低 ${ruleStats.hoursMin}）`
      case 'post_imbalance':
        return `最大哨點分配差距 ${ruleStats.postMaxSpread} 班`
      default:
        return null
    }
  }

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
              <button
                onClick={() => setSwapModalOpen(true)}
                disabled={activeGuards.length === 0}
                className="px-4 py-2.5 text-sm text-orange-600 hover:bg-orange-50 border border-orange-200 font-medium rounded-xl transition disabled:opacity-50"
              >
                建立調班單
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

                    return (
                      <td
                        key={date}
                        title={violation?.message}
                        className={`relative border-b border-r border-gray-100 px-1 py-3.5 text-center ${
                          violation ? 'bg-red-50' : isOff ? 'bg-blue-50/50' : ''
                        }`}
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

      {/* 調班單精靈 */}
      {swapModalOpen && schedule && (
        <SwapRequestModal
          schedule={schedule}
          guards={guards}
          posts={posts}
          holidays={holidays}
          onClose={() => setSwapModalOpen(false)}
          onApply={handleSwapApplied}
        />
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
                const statLine = ruleStatLine(type)
                return (
                  <li key={type}>
                    <div className="flex items-start justify-between px-4 py-3 gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className={`text-sm leading-5 ${pass ? 'text-green-500' : 'text-red-500'}`}>
                          {pass ? '✓' : '✗'}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm text-gray-700">{label}</span>
                          {statLine && (
                            <p className="text-xs text-gray-400 mt-0.5">{statLine}</p>
                          )}
                        </div>
                      </div>
                      {!pass && (
                        <span className="flex-shrink-0 text-sm font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
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

      {/* 調班紀錄列表（P6） */}
      {schedule && (
        <div className="mt-6">
          <SwapRequestList swapRequests={swapRequests} guards={guards} />
        </div>
      )}
    </div>
  )
}
