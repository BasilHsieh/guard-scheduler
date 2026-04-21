import { useState, useEffect } from 'react'
import type { MonthSchedule, Guard, CalendarData } from '../types'
import { getSchedule, getGuards, getCalendar, saveCalendar } from '../store'
import { loadCalendar } from '../lib/calendar'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const POST_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-700',
  B: 'bg-indigo-100 text-indigo-700',
  C: 'bg-violet-100 text-violet-700',
  D: 'bg-cyan-100 text-cyan-700',
  E: 'bg-teal-100 text-teal-700',
  F: 'bg-orange-100 text-orange-700',
  G: 'bg-amber-100 text-amber-700',
}

function getDaysInMonth(year: number, month: number): (string | null)[] {
  const days: (string | null)[] = []
  const first = new Date(year, month - 1, 1).getDay()
  for (let i = 0; i < first; i++) days.push(null)
  const total = new Date(year, month, 0).getDate()
  for (let d = 1; d <= total; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

function isWeekend(date: string) {
  const d = new Date(date).getDay()
  return d === 0 || d === 6
}

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null)
  const [guards, setGuards] = useState<Guard[]>([])
  const [calendar, setCalendar] = useState<CalendarData | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setGuards(getGuards())
  }, [])

  useEffect(() => {
    setSchedule(getSchedule(year, month))
    const cached = getCalendar(year)
    if (cached && cached.holidays.length > 0) {
      setCalendar(cached)
    } else {
      loadCalendar(year).then((data) => {
        setCalendar(data)
        saveCalendar(data)
      })
    }
  }, [year, month])

  async function syncHolidays() {
    setSyncing(true)
    const data = await loadCalendar(year)
    setCalendar(data)
    saveCalendar(data)
    setSyncing(false)
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const holidays = calendar?.holidays ?? []
  const holidayNames = calendar?.holidayNames ?? {}
  const days = getDaysInMonth(year, month)
  const activeGuards = guards.filter(g => g.active)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">月曆</h2>
          <p className="text-sm text-gray-500">
            {calendar?.lastUpdated
              ? `假日資料更新於 ${new Date(calendar.lastUpdated).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}`
              : '載入假日資料中…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={syncHolidays}
            disabled={syncing}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg disabled:text-gray-400 transition"
          >
            {syncing ? '更新中…' : '更新假日資料'}
          </button>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* 星期標題 */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`py-4 text-center text-base font-semibold ${
                  i === 0 || i === 6 ? 'text-blue-500' : 'text-gray-500'
                }`}
              >
                {w}
              </div>
            ))}
          </div>

          {/* 日期格子 */}
          <div className="grid grid-cols-7">
            {days.map((date, i) => {
              if (!date) {
                return <div key={`empty-${i}`} className="border-b border-r border-gray-100 min-h-28" />
              }

              const daySchedule = schedule?.days.find(d => d.date === date)
              const isHoliday = holidays.includes(date) || isWeekend(date)
              const isTyphoon = daySchedule?.isTyphoon ?? false
              const dayNum = parseInt(date.slice(8))
              const isLastRow = i >= days.length - 7
              const caption = holidayNames[date]

              return (
                <div
                  key={date}
                  className={`border-b border-r border-gray-100 min-h-32 p-3 ${
                    isTyphoon ? 'bg-red-50' : isHoliday ? 'bg-blue-50' : 'bg-white'
                  } ${isLastRow ? 'border-b-0' : ''}`}
                >
                  {/* 日期 + 假日名稱 */}
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-base font-bold ${
                      isTyphoon ? 'text-red-500' : isHoliday ? 'text-blue-500' : 'text-gray-700'
                    }`}>
                      {dayNum}
                    </span>
                    {isTyphoon && (
                      <span className="text-xs bg-red-100 text-red-500 px-1.5 rounded">颱風</span>
                    )}
                    {caption && !isTyphoon && (
                      <span className="text-xs text-blue-400 text-right leading-tight max-w-[60px]">{caption}</span>
                    )}
                  </div>

                  {/* 排班 */}
                  {daySchedule && (
                    <div className="space-y-1">
                      {daySchedule.assignments
                        .filter(a => a.postId !== null)
                        .map(a => {
                          const guard = activeGuards.find(g => g.id === a.guardId)
                          if (!guard) return null
                          return (
                            <div
                              key={a.guardId}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${POST_COLORS[a.postId!] ?? 'bg-gray-100 text-gray-600'}`}
                            >
                              <span>{guard.name}</span>
                              <span className="opacity-60">{a.postId}</span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
    </div>
  )
}
