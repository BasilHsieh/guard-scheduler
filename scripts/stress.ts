/**
 * Stress test：針對接近門檻的月份跑更多 attempts + 多組 seed，
 * 判斷是「演算法運氣」還是「數學極限」。
 *
 * 跑法：npx tsx scripts/stress.ts（或用 vitest 包裝）
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
const GUARD_IDS = GUARDS.map((g) => g.id)

const HOLIDAYS: Record<number, string[]> = {
  6: ['2026-06-19'],
  9: ['2026-09-25'],
  10: ['2026-10-09', '2026-10-12'],
}

const TARGETS = [6, 9, 10]
const SEEDS = [1, 42, 100, 999, 31337, 87654, 2026, 55555, 123456, 7777]
const ATTEMPTS = 300

for (const month of TARGETS) {
  console.log(`\n=== 2026-${String(month).padStart(2, '0')} ===`)
  let bestSpread = Infinity
  let bestPostMax = Infinity
  for (const seed of SEEDS) {
    const s = generateSchedule(2026, month, GUARDS, POSTS, HOLIDAYS[month] ?? [], { attempts: ATTEMPTS, seed })
    const hours = GUARD_IDS.map((id) => calcMonthlyHours(id, s, POSTS))
    const spread = Math.max(...hours) - Math.min(...hours)
    const postIds: PostId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    const postMax = Math.max(...postIds.map((p) => {
      const c = GUARD_IDS.map((id) => calcPostCounts(id, s)[p])
      return Math.max(...c) - Math.min(...c)
    }))
    const hard = validateSchedule(s, POSTS, GUARD_IDS)
      .filter((v) => ['consecutive_days', 'consecutive_post', 'holiday_day_alternation', 'holiday_post_alternation'].includes(v.type)).length
    bestSpread = Math.min(bestSpread, spread)
    bestPostMax = Math.min(bestPostMax, postMax)
    console.log(`  seed=${String(seed).padStart(6)}: 硬違規=${hard}, 時數 spread=${spread}h, 哨點 max=${postMax}`)
  }
  console.log(`  → 最佳：時數 spread=${bestSpread}h, 哨點 max=${bestPostMax}`)
}
