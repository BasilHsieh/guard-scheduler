/**
 * 深入分析指定月份為什麼軟目標達不到。
 */
import { generateSchedule } from '../src/lib/scheduler'
import { validateSchedule, calcMonthlyHours, calcPostCounts } from '../src/lib/validator'
import type { Guard, Post, PostId } from '../src/types'

const GUARDS: Guard[] = [
  { id: 'G1', name: '王大明', active: true },
  { id: 'G2', name: '李小華', active: true },
  { id: 'G3', name: '張志偉', active: true },
  { id: 'G4', name: '陳美玲', active: true },
  { id: 'G5', name: '林建國', active: true },
  { id: 'G6', name: '吳雅婷', active: true },
]
const POSTS: Post[] = [
  { id: 'A', type: 'weekday', hours: 10 },
  { id: 'B', type: 'weekday', hours: 10 },
  { id: 'C', type: 'weekday', hours: 10 },
  { id: 'D', type: 'weekday', hours: 12 },
  { id: 'E', type: 'weekday', hours: 12 },
  { id: 'F', type: 'holiday', hours: 12 },
  { id: 'G', type: 'holiday', hours: 12 },
]

const MONTHS: Array<{ year: number; month: number; holidays: string[]; note: string }> = [
  { year: 2026, month: 6,  holidays: ['2026-06-19'],                                           note: '端午節（週五）' },
  { year: 2026, month: 2,  holidays: ['2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20'], note: '春節調整（週一 ~ 週五）' },
]

function isWeekend(date: string): boolean {
  return [0, 6].includes(new Date(date).getDay())
}

function analyze(year: number, month: number, holidays: string[], note: string) {
  console.log(`\n\n═════════════ ${year}-${String(month).padStart(2, '0')}  ${note} ═════════════`)

  const totalDays = new Date(year, month, 0).getDate()
  const allDates: string[] = []
  for (let d = 1; d <= totalDays; d++) {
    allDates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  const holidayDates = allDates.filter((d) => holidays.includes(d) || isWeekend(d))
  const weekdayDates = allDates.filter((d) => !(holidays.includes(d) || isWeekend(d)))

  console.log(`\n平日 ${weekdayDates.length} 天，假日 ${holidayDates.length} 天`)
  console.log(`假日日期（含週別）：`)
  const dowMap: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  for (const d of holidayDates) {
    const dow = new Date(d).getDay()
    dowMap[dow]++
    const dowStr = ['日','一','二','三','四','五','六'][dow]
    console.log(`  ${d} (${dowStr})${holidays.includes(d) ? ' ← 國定' : ''}`)
  }
  console.log(`  → 星期分布：` + ['日','一','二','三','四','五','六'].map((n, i) => `${n}${dowMap[i]}`).join(' '))

  console.log(`\n每個哨點理論 diff：`)
  for (const p of POSTS) {
    const total = p.type === 'holiday' ? holidayDates.length : weekdayDates.length
    const q = total / 6
    const diff = total % 6 === 0 ? 0 : 1
    console.log(`  ${p.id}: ${total} 次 ÷ 6 = ${q.toFixed(2)} → 理論 min diff = ${diff}`)
  }

  const schedule = generateSchedule(year, month, GUARDS, POSTS, holidays, { attempts: 300, seed: 12345 })

  console.log(`\n完整排班：`)
  const maxDayStrLen = String(totalDays).length
  const header = '        ' + allDates.map((d) => d.slice(8).padStart(maxDayStrLen)).join(' ')
  console.log(header)
  console.log('        ' + allDates.map((d) => ['日','一','二','三','四','五','六'][new Date(d).getDay()].padStart(maxDayStrLen)).join(' '))
  for (const g of GUARDS) {
    const assigns = allDates.map((date) => {
      const day = schedule.days.find((dd) => dd.date === date)!
      const a = day.assignments.find((x) => x.guardId === g.id)
      return a?.postId ?? '·'
    })
    console.log(g.name.padEnd(6) + '  ' + assigns.map((x) => x.toString().padStart(maxDayStrLen)).join(' '))
  }

  console.log(`\n每人哨點次數：`)
  const postIds: PostId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  console.log('        ' + postIds.map((p) => p.padStart(3)).join('') + '  時數')
  for (const g of GUARDS) {
    const counts = calcPostCounts(g.id, schedule)
    const hours = calcMonthlyHours(g.id, schedule, POSTS)
    console.log(g.name.padEnd(6) + '  ' + postIds.map((p) => String(counts[p]).padStart(3)).join('') + `  ${hours}h`)
  }

  console.log(`\n每個哨點 spread：`)
  for (const p of postIds) {
    const cs = GUARDS.map((g) => calcPostCounts(g.id, schedule)[p])
    const spread = Math.max(...cs) - Math.min(...cs)
    console.log(`  ${p}: [${cs.join(', ')}] spread=${spread}${spread > 1 ? ' ⚠️' : ''}`)
  }

  const v = validateSchedule(schedule, POSTS, GUARDS.map((g) => g.id))
  console.log(`\n違規（${v.length}）：`)
  const hard = v.filter((x) => ['consecutive_days', 'consecutive_post', 'holiday_day_alternation', 'holiday_post_alternation'].includes(x.type))
  const soft = v.filter((x) => !hard.includes(x))
  console.log(`  硬違規：${hard.length} 個`)
  const softByType = new Map<string, string[]>()
  for (const x of soft) {
    const arr = softByType.get(x.type) ?? []
    arr.push(`${x.guardId}: ${x.message}`)
    softByType.set(x.type, arr)
  }
  for (const [t, msgs] of softByType) {
    console.log(`  [${t}] ${msgs.length} 筆`)
    for (const m of msgs) console.log(`     ${m}`)
  }
}

for (const m of MONTHS) analyze(m.year, m.month, m.holidays, m.note)
