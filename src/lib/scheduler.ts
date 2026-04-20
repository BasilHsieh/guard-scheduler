import type { Guard, Post, DaySchedule, MonthSchedule, Assignment, PostId } from '../types'

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const total = new Date(year, month, 0).getDate()
  for (let d = 1; d <= total; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

function isWeekend(date: string): boolean {
  const d = new Date(date).getDay()
  return d === 0 || d === 6
}

function prevDateStr(date: string): string {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getLastHolidayAssignment(
  guardId: string,
  beforeDate: string,
  days: DaySchedule[]
): { date: string; postId: PostId } | null {
  const holidayDays = days
    .filter((d) => d.date < beforeDate && (d.isHoliday || isWeekend(d.date)))
    .reverse()
  for (const day of holidayDays) {
    const a = day.assignments.find((a) => a.guardId === guardId && a.postId !== null)
    if (a?.postId) return { date: day.date, postId: a.postId }
  }
  return null
}

function isHolidayAssignmentValid(
  guardId: string,
  date: string,
  postId: PostId,
  days: DaySchedule[]
): boolean {
  const last = getLastHolidayAssignment(guardId, date, days)
  if (!last) return true
  const dayOk = new Date(last.date).getDay() !== new Date(date).getDay()
  const postOk = last.postId !== postId
  return dayOk && postOk
}

function countConsecutiveWorkDays(guardId: string, beforeDate: string, days: DaySchedule[]): number {
  let count = 0
  for (const day of [...days].reverse()) {
    if (day.date >= beforeDate) continue
    const worked = day.assignments.some((a) => a.guardId === guardId && a.postId !== null)
    if (worked) count++
    else break
  }
  return count
}

function getYesterdayPost(guardId: string, date: string, days: DaySchedule[]): PostId | null {
  const yDate = prevDateStr(date)
  return days.find((d) => d.date === yDate)?.assignments.find((a) => a.guardId === guardId)?.postId ?? null
}

function computeCurrentCounts(guardId: string, days: DaySchedule[]): Record<PostId, number> {
  const counts: Record<PostId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }
  for (const day of days) {
    const a = day.assignments.find((a) => a.guardId === guardId)
    if (a?.postId) counts[a.postId]++
  }
  return counts
}

function computeCurrentHours(guardId: string, days: DaySchedule[], posts: Post[]): number {
  return days.reduce((total, day) => {
    const a = day.assignments.find((a) => a.guardId === guardId)
    if (!a?.postId) return total
    return total + (posts.find((p) => p.id === a.postId)?.hours ?? 0)
  }, 0)
}

// 預計算每人每個哨點的目標次數
function calcQuotas(
  allDates: string[],
  holidays: string[],
  posts: Post[],
  numGuards: number
): Record<PostId, number> {
  const quotas: Record<PostId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }
  let weekdayCount = 0
  let holidayCount = 0

  for (const date of allDates) {
    if (holidays.includes(date) || isWeekend(date)) holidayCount++
    else weekdayCount++
  }

  for (const post of posts) {
    const total = post.type === 'weekday' ? weekdayCount : holidayCount
    quotas[post.id] = total / numGuards
  }
  return quotas
}

export function generateSchedule(
  year: number,
  month: number,
  guards: Guard[],
  posts: Post[],
  holidays: string[]
): MonthSchedule {
  const activeGuards = guards.filter((g) => g.active)
  // 時數高的哨點優先排（12h 的 D/E 先於 10h 的 A/B/C），確保時數多的需求優先被滿足
  const weekdayPosts = posts
    .filter((p) => p.type === 'weekday')
    .sort((a, b) => b.hours - a.hours)
    .map((p) => p.id) as PostId[]
  const holidayPosts = posts
    .filter((p) => p.type === 'holiday')
    .sort((a, b) => b.hours - a.hours)
    .map((p) => p.id) as PostId[]
  const allDates = getDaysInMonth(year, month)
  const days: DaySchedule[] = []

  const quotas = calcQuotas(allDates, holidays, posts, activeGuards.length)

  for (const date of allDates) {
    const isHoliday = holidays.includes(date) || isWeekend(date)
    const day: DaySchedule = { date, isHoliday, isTyphoon: false, assignments: [] }
    const requiredPosts: PostId[] = isHoliday ? holidayPosts : weekdayPosts
    const assigned = new Set<string>()

    // 必須休息（連續 6 天）
    const mustRestIds = new Set(
      activeGuards
        .filter(g => countConsecutiveWorkDays(g.id, date, days) >= 6)
        .map(g => g.id)
    )

    // 主動決定今天休息的人：從剩餘人中挑時數最多的，直到人數符合哨點需求
    const eligible = activeGuards.filter(g => !mustRestIds.has(g.id))
    const voluntaryRestCount = Math.max(0, eligible.length - requiredPosts.length)
    const sortedByHoursDesc = [...eligible].sort(
      (a, b) => computeCurrentHours(b.id, days, posts) - computeCurrentHours(a.id, days, posts)
    )
    const voluntaryRestIds = new Set(sortedByHoursDesc.slice(0, voluntaryRestCount).map(g => g.id))

    for (const postId of requiredPosts) {
      const candidates = eligible.filter((g) => {
        if (assigned.has(g.id)) return false
        if (voluntaryRestIds.has(g.id)) return false
        if (getYesterdayPost(g.id, date, days) === postId) return false
        if (isHoliday && !isHolidayAssignmentValid(g.id, date, postId, days)) return false
        return true
      })

      if (candidates.length === 0) continue

      candidates.sort((a, b) => {
        const countsA = computeCurrentCounts(a.id, days)
        const countsB = computeCurrentCounts(b.id, days)

        const remainA = quotas[postId] - countsA[postId]
        const remainB = quotas[postId] - countsB[postId]
        if (Math.abs(remainA - remainB) > 0.01) return remainB - remainA

        const hoursA = computeCurrentHours(a.id, days, posts)
        const hoursB = computeCurrentHours(b.id, days, posts)
        return hoursA - hoursB
      })

      const chosen = candidates[0]
      assigned.add(chosen.id)
      day.assignments.push({ guardId: chosen.id, postId })
    }

    for (const g of activeGuards) {
      if (!assigned.has(g.id)) {
        day.assignments.push({ guardId: g.id, postId: null })
      }
    }

    days.push(day)
  }

  return { year, month, days, updatedAt: new Date().toISOString() }
}

export function applyTyphoonDay(day: DaySchedule, posts: Post[]): DaySchedule {
  const deGuards = day.assignments
    .filter((a) => a.postId === 'D' || a.postId === 'E')
    .map((a) => a.guardId)

  const holidayPosts: PostId[] = ['F', 'G']
  const newAssignments: Assignment[] = []

  deGuards.forEach((guardId, i) => {
    newAssignments.push({ guardId, postId: holidayPosts[i] ?? null })
  })

  for (const a of day.assignments) {
    if (!deGuards.includes(a.guardId)) {
      newAssignments.push({ guardId: a.guardId, postId: null })
    }
  }

  return {
    ...day,
    isTyphoon: true,
    isHoliday: true,
    assignments: newAssignments,
    originalAssignments: day.assignments,
  }
}
