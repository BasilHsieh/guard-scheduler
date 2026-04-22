import { describe, it, expect } from 'vitest'
import { generateSchedule } from './scheduler'
import { validateSchedule, calcMonthlyHours, calcPostCounts } from './validator'
import type { Guard, Post, PostId } from '../types'

/**
 * 12 個月 benchmark：驗證新演算法的硬違規（規則 1-4）應為 0，
 * 並量化軟目標（規則 5-6）的達成率。
 *
 * 跑法：npm test
 * 要跳過：改成 describe.skip
 */

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
const GUARD_IDS = GUARDS.map((g) => g.id)

// 2026 台灣國定假日（不含週末；用於測試假日分布）
const HOLIDAYS_2026: Record<number, string[]> = {
  1: ['2026-01-01', '2026-01-02'],                              // 元旦
  2: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20'], // 春節調整
  3: [],
  4: ['2026-04-03', '2026-04-06'],                              // 清明連假
  5: ['2026-05-01'],                                            // 勞動節
  6: ['2026-06-19'],                                            // 端午節
  7: [],
  8: [],
  9: ['2026-09-25'],                                            // 中秋節
  10: ['2026-10-09', '2026-10-12'],                             // 國慶連假
  11: [],
  12: [],
}

interface MonthStat {
  month: string
  hardViolations: number
  hoursMin: number
  hoursMax: number
  hoursSpread: number
  hoursMeetsThreshold: boolean
  postMaxSpread: number
  postMeetsThreshold: boolean
  perPostSpreads: Record<PostId, number>
}

function analyzeMonth(year: number, month: number): MonthStat {
  const holidays = HOLIDAYS_2026[month] ?? []
  const schedule = generateSchedule(year, month, GUARDS, POSTS, holidays, { attempts: 1000, seed: 12345 })
  const violations = validateSchedule(schedule, POSTS, GUARD_IDS)

  const hardTypes = new Set(['consecutive_days', 'consecutive_post', 'holiday_day_alternation', 'holiday_post_alternation'])
  const hardCount = violations.filter((v) => hardTypes.has(v.type)).length

  const hoursArr = GUARD_IDS.map((id) => calcMonthlyHours(id, schedule, POSTS))
  const hoursMin = Math.min(...hoursArr)
  const hoursMax = Math.max(...hoursArr)
  const hoursSpread = hoursMax - hoursMin

  const postIds: PostId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  const perPostSpreads = {} as Record<PostId, number>
  let postMaxSpread = 0
  for (const p of postIds) {
    const counts = GUARD_IDS.map((id) => calcPostCounts(id, schedule)[p])
    const spread = Math.max(...counts) - Math.min(...counts)
    perPostSpreads[p] = spread
    postMaxSpread = Math.max(postMaxSpread, spread)
  }

  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    hardViolations: hardCount,
    hoursMin,
    hoursMax,
    hoursSpread,
    hoursMeetsThreshold: hoursSpread <= 12,
    postMaxSpread,
    postMeetsThreshold: postMaxSpread <= 1,
    perPostSpreads,
  }
}

describe('benchmark：2026 全年 12 個月', () => {
  const stats: MonthStat[] = []
  for (let m = 1; m <= 12; m++) stats.push(analyzeMonth(2026, m))

  // 印出總表
  const headers = '月份      | 硬違規 | 時數區間   | Spread | ≤12h | 哨點 max | ≤1'
  console.log('\n' + headers)
  console.log('-'.repeat(headers.length))
  for (const s of stats) {
    const row = [
      s.month,
      String(s.hardViolations).padStart(6),
      `${s.hoursMin}h-${s.hoursMax}h`.padEnd(10),
      `${s.hoursSpread}h`.padStart(6),
      (s.hoursMeetsThreshold ? '✓' : '✗').padEnd(4),
      String(s.postMaxSpread).padStart(8),
      s.postMeetsThreshold ? '✓' : '✗',
    ].join(' | ')
    console.log(row)
  }

  const hardOK = stats.every((s) => s.hardViolations === 0)
  const hoursOK = stats.filter((s) => s.hoursMeetsThreshold).length
  const postOK = stats.filter((s) => s.postMeetsThreshold).length
  console.log('-'.repeat(headers.length))
  console.log(`硬違規 0   ：${hardOK ? '全部月份 ✓' : '有月份違規 ✗'}`)
  console.log(`時數 ≤ 12h ：${hoursOK}/12 個月達標`)
  console.log(`哨點 ≤ 1   ：${postOK}/12 個月達標`)
  console.log('')

  it('硬違規（規則 1-4）：全部月份必須為 0', () => {
    for (const s of stats) {
      expect(s.hardViolations, `${s.month} 出現硬違規`).toBe(0)
    }
  })

  it('報告軟目標達成率（記錄用，不強制通過）', () => {
    expect(stats.length).toBe(12)
  })
})
