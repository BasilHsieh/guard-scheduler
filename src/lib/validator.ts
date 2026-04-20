import type { MonthSchedule, Post, PostId } from '../types'

export type ViolationType =
  | 'consecutive_days'
  | 'consecutive_post'
  | 'holiday_day_alternation'
  | 'holiday_post_alternation'
  | 'hours_imbalance'
  | 'post_imbalance'

export interface Violation {
  date: string
  guardId: string
  type: ViolationType
  message: string
}

export interface RuleCheck {
  type: ViolationType
  label: string
}

export const RULES: RuleCheck[] = [
  { type: 'consecutive_days',         label: '不超過連續 6 天上班' },
  { type: 'consecutive_post',         label: '不重複相鄰哨點' },
  { type: 'holiday_day_alternation',  label: '假日星期交替（六 ↔ 日）' },
  { type: 'holiday_post_alternation', label: '假日哨點交替（F ↔ G）' },
  { type: 'hours_imbalance',          label: '每人月總時數相近' },
  { type: 'post_imbalance',           label: '每個哨點平均分配' },
]

function isWeekend(date: string): boolean {
  const d = new Date(date).getDay()
  return d === 0 || d === 6
}

function isHolidayDay(date: string, schedule: MonthSchedule): boolean {
  const day = schedule.days.find(d => d.date === date)
  return day?.isHoliday ?? isWeekend(date)
}

export function validateSchedule(schedule: MonthSchedule, posts: Post[], guardIds: string[]): Violation[] {
  const violations: Violation[] = []
  const days = schedule.days

  for (const guardId of guardIds) {
    for (let i = 0; i < days.length; i++) {
      const day = days[i]
      const assignment = day.assignments.find(a => a.guardId === guardId)
      if (!assignment || assignment.postId === null) continue

      const date = day.date
      const postId = assignment.postId

      // 規則 1：連續上班不超過 6 天
      let consecutive = 0
      for (let j = i - 1; j >= 0; j--) {
        const prev = days[j].assignments.find(a => a.guardId === guardId)
        if (prev?.postId !== null && prev?.postId !== undefined) consecutive++
        else break
      }
      if (consecutive >= 6) {
        violations.push({ date, guardId, type: 'consecutive_days', message: `連續上班第 ${consecutive + 1} 天` })
      }

      // 規則 2：不能連續同哨點
      if (i > 0) {
        const prevA = days[i - 1].assignments.find(a => a.guardId === guardId)
        if (prevA?.postId === postId) {
          violations.push({ date, guardId, type: 'consecutive_post', message: `連續兩天在 ${postId} 哨點` })
        }
      }

      // 規則 3 & 4：假日輪替
      if (isHolidayDay(date, schedule) && (postId === 'F' || postId === 'G')) {
        const prevHolidays = days
          .filter(d => d.date < date && isHolidayDay(d.date, schedule))
          .reverse()

        for (const prevDay of prevHolidays) {
          const prevA = prevDay.assignments.find(a => a.guardId === guardId)
          if (!prevA?.postId || (prevA.postId !== 'F' && prevA.postId !== 'G')) continue

          const prevDow = new Date(prevDay.date).getDay()
          const currDow = new Date(date).getDay()

          if (prevDow === currDow) {
            violations.push({ date, guardId, type: 'holiday_day_alternation', message: `假日星期未交替（連續${currDow === 6 ? '六' : '日'}）` })
          }
          if (prevA.postId === postId) {
            violations.push({ date, guardId, type: 'holiday_post_alternation', message: `假日哨點未交替（連續 ${postId}）` })
          }
          break
        }
      }
    }
  }

  // 規則 5：時數平衡（最多與最少相差超過 12h 視為不平衡）
  const hoursMap = Object.fromEntries(
    guardIds.map(id => [id, calcMonthlyHours(id, schedule, posts)])
  )
  const hoursValues = Object.values(hoursMap)
  const maxH = Math.max(...hoursValues)
  const minH = Math.min(...hoursValues)
  if (maxH - minH > 12) {
    for (const guardId of guardIds) {
      const h = hoursMap[guardId]
      if (h === maxH || h === minH) {
        violations.push({
          date: '',
          guardId,
          type: 'hours_imbalance',
          message: `本月 ${h}h（最高 ${maxH}h，最低 ${minH}h，差距 ${maxH - minH}h）`,
        })
      }
    }
  }

  // 規則 6：哨點平均（同哨點中最多與最少相差超過 2 次視為不平衡）
  const postIds: PostId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  for (const postId of postIds) {
    const countMap = Object.fromEntries(
      guardIds.map(id => [id, calcPostCounts(id, schedule)[postId]])
    )
    const counts = Object.values(countMap)
    const maxC = Math.max(...counts)
    const minC = Math.min(...counts)
    if (maxC - minC > 1) {
      for (const guardId of guardIds) {
        const c = countMap[guardId]
        if (c === maxC || c === minC) {
          violations.push({
            date: '',
            guardId,
            type: 'post_imbalance',
            message: `哨點 ${postId}：${c} 次（最高 ${maxC}，最低 ${minC}）`,
          })
        }
      }
    }
  }

  return violations
}

export function calcPostCounts(guardId: string, schedule: MonthSchedule): Record<PostId, number> {
  const counts: Record<PostId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }
  for (const day of schedule.days) {
    const a = day.assignments.find(a => a.guardId === guardId)
    if (a?.postId) counts[a.postId]++
  }
  return counts
}

export function calcMonthlyHours(guardId: string, schedule: MonthSchedule, posts: Post[]): number {
  return schedule.days.reduce((total, day) => {
    const a = day.assignments.find(a => a.guardId === guardId)
    if (!a?.postId) return total
    const post = posts.find(p => p.id === a.postId)
    return total + (post?.hours ?? 0)
  }, 0)
}
