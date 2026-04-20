import { useState, useEffect } from 'react'
import type { MonthSchedule, Guard, Post, PostId } from '../types'
import { getGuards, getPosts, getCalendar, getSchedule, saveSchedule } from '../store'
import { generateSchedule, applyTyphoonDay } from '../lib/scheduler'
import { validateSchedule, calcMonthlyHours, calcPostCounts, RULES, type Violation } from '../lib/validator'

const MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
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

export default function SchedulePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null)
  const [guards, setGuards] = useState<Guard[]>([])
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    setGuards(getGuards())
    setPosts(getPosts())
  }, [])

  useEffect(() => {
    setSchedule(getSchedule(year, month))
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
    console.log('handleGenerate called', { year, month, guardsCount: guards.length })
    const calendar = getCalendar(year)
    const holidays = calendar?.holidays ?? []
    const result = generateSchedule(year, month, guards, posts, holidays)
    console.log('generated', result.updatedAt, 'days:', result.days.length)
    saveSchedule(result)
    console.log('saved, key:', `schedule_${year}_${month}`)
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

                    return (
                      <td
                        key={date}
                        title={violation?.message}
                        className={`border-b border-r border-gray-100 px-1 py-2 text-center ${
                          violation ? 'bg-red-50' : isOff ? 'bg-blue-50/40' : ''
                        }`}
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
                      </td>
                    )
                  })}
                </tr>
              ))}
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
