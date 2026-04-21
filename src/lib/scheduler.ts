import type { Guard, Post, DaySchedule, MonthSchedule, Assignment, PostId } from '../types'

// ─── 日期工具 ────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const total = new Date(year, month, 0).getDate()
  for (let d = 1; d <= total; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

function isWeekend(date: string): boolean {
  return [0, 6].includes(new Date(date).getDay())
}

function prevDateStr(date: string): string {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── 排班規則輔助 ─────────────────────────────────────────────────────────────

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
  return (
    new Date(last.date).getDay() !== new Date(date).getDay() &&
    last.postId !== postId
  )
}

function countConsecutiveWorkDays(guardId: string, beforeDate: string, days: DaySchedule[]): number {
  let count = 0
  for (const day of [...days].reverse()) {
    if (day.date >= beforeDate) continue
    if (day.assignments.some((a) => a.guardId === guardId && a.postId !== null)) count++
    else break
  }
  return count
}

function getYesterdayPost(guardId: string, date: string, days: DaySchedule[]): PostId | null {
  const yDate = prevDateStr(date)
  return (
    days.find((d) => d.date === yDate)?.assignments.find((a) => a.guardId === guardId)?.postId ??
    null
  )
}

function computeCurrentHours(guardId: string, days: DaySchedule[], posts: Post[]): number {
  return days.reduce((total, day) => {
    const a = day.assignments.find((a) => a.guardId === guardId)
    if (!a?.postId) return total
    return total + (posts.find((p) => p.id === a.postId)?.hours ?? 0)
  }, 0)
}

// ─── Phase 1：預算配額 ────────────────────────────────────────────────────────
//
// Step 1：每個哨點基礎配額 = ⌊T/N⌋（保證差距 ≤ 1）
// Step 2：把所有哨點的多餘名額集中在一起，按時數由高到低，
//          統一分給「目前多餘時數最少」的人（全域最小化時數方差），
//          同一哨點每人只能拿一個多餘名額。

function calcTargetCounts(
  allDates: string[],
  holidays: string[],
  posts: Post[],
  guards: Guard[]
): Record<string, Record<PostId, number>> {
  const N = guards.length
  const targets: Record<string, Record<PostId, number>> = {}
  for (const g of guards) targets[g.id] = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }

  const postTotals = new Map<PostId, number>()
  for (const post of posts) {
    const total = allDates.filter((d) =>
      post.type === 'holiday'
        ? holidays.includes(d) || isWeekend(d)
        : !holidays.includes(d) && !isWeekend(d)
    ).length
    postTotals.set(post.id, total)
    const base = Math.floor(total / N)
    for (const g of guards) targets[g.id][post.id] = base
  }

  interface ExtraSlot { postId: PostId; hours: number }
  const allExtras: ExtraSlot[] = []
  for (const post of posts) {
    const extras = (postTotals.get(post.id) ?? 0) % N
    for (let i = 0; i < extras; i++) allExtras.push({ postId: post.id, hours: post.hours })
  }
  allExtras.sort((a, b) => b.hours - a.hours)

  const extraHours = new Map<string, number>(guards.map((g) => [g.id, 0]))
  const extraReceived = new Map<string, Set<PostId>>(guards.map((g) => [g.id, new Set()]))

  for (const extra of allExtras) {
    let minId: string | null = null
    let minH = Infinity
    for (const g of guards) {
      if (extraReceived.get(g.id)!.has(extra.postId)) continue
      const h = extraHours.get(g.id) ?? 0
      if (h < minH) { minH = h; minId = g.id }
    }
    if (!minId) continue
    targets[minId][extra.postId]++
    extraReceived.get(minId)!.add(extra.postId)
    extraHours.set(minId, (extraHours.get(minId) ?? 0) + extra.hours)
  }

  return targets
}

// ─── Phase 2：逐日排班（回溯最佳指派） ───────────────────────────────────────
//
// 每天為所有 (人員, 哨點) 組合計算「緊迫度分數」：
//
//   urgency(G, P) = remaining[G][P] − target[G][P] × (同類型剩餘天數 / 總天數)
//
//   正值 → 落後進度（優先排）；負值 → 超前進度（可晚排）
//
// 用**回溯搜尋**窮舉當天所有可能的完整指派（最多 P(6,5)=720 種），
// 選出「所有 (人員, 哨點) urgency 分數加總最高」的指派。
//
// 與貪婪法相比：回溯保證每天的指派是全域最優，
// 不會因為「搶先佔了高分 pair」而讓另一人錯失其配額。

interface DayAssignment { guardId: string; postId: PostId }

function findOptimalDayAssignment(
  requiredPosts: PostId[],
  eligible: Guard[],
  scoreFn: (g: Guard, p: PostId) => number
): DayAssignment[] {
  let bestTotal = -Infinity
  let bestResult: DayAssignment[] = []

  // 為每個哨點預先排序候選人（由高到低），讓回溯優先探索好的分支
  const sorted: Map<PostId, Guard[]> = new Map(
    requiredPosts.map((p) => [
      p,
      [...eligible].sort((a, b) => scoreFn(b, p) - scoreFn(a, p)),
    ])
  )

  function bt(
    postIdx: number,
    usedGuards: Set<string>,
    current: DayAssignment[],
    totalScore: number
  ) {
    if (postIdx === requiredPosts.length) {
      if (totalScore > bestTotal) {
        bestTotal = totalScore
        bestResult = [...current]
      }
      return
    }

    const postId = requiredPosts[postIdx]
    const candidates = sorted.get(postId)!.filter((g) => !usedGuards.has(g.id))

    if (candidates.length === 0) {
      // 理論上不應發生（人數 > 哨點數），視為大幅懲罰
      if (totalScore - 10000 > bestTotal || bestResult.length === 0) {
        bt(postIdx + 1, usedGuards, current, totalScore - 10000)
      }
      return
    }

    for (const g of candidates) {
      const s = scoreFn(g, postId)
      usedGuards.add(g.id)
      current.push({ guardId: g.id, postId })
      bt(postIdx + 1, usedGuards, current, totalScore + s)
      current.pop()
      usedGuards.delete(g.id)
    }
  }

  bt(0, new Set(), [], 0)
  return bestResult
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function hoursSpread(schedule: MonthSchedule, posts: Post[]): number {
  const hours: Record<string, number> = {}
  for (const day of schedule.days) {
    for (const a of day.assignments) {
      if (!a.postId) continue
      hours[a.guardId] = (hours[a.guardId] ?? 0) + (posts.find((p) => p.id === a.postId)?.hours ?? 0)
    }
  }
  const vals = Object.values(hours)
  if (vals.length === 0) return 0
  return Math.max(...vals) - Math.min(...vals)
}

export function generateSchedule(
  year: number,
  month: number,
  guards: Guard[],
  posts: Post[],
  holidays: string[]
): MonthSchedule {
  // 多跑幾次，取時數差最小的結果
  const ATTEMPTS = 20
  let best: MonthSchedule | null = null
  let bestSpread = Infinity
  for (let i = 0; i < ATTEMPTS; i++) {
    const result = generateScheduleOnce(year, month, guards, posts, holidays)
    const spread = hoursSpread(result, posts)
    if (spread < bestSpread) { bestSpread = spread; best = result }
    if (bestSpread === 0) break
  }
  return best!
}

function generateScheduleOnce(
  year: number,
  month: number,
  guards: Guard[],
  posts: Post[],
  holidays: string[]
): MonthSchedule {
  const activeGuards = shuffle(guards.filter((g) => g.active))
  const N = activeGuards.length
  const allDates = getDaysInMonth(year, month)
  const days: DaySchedule[] = []

  if (N === 0) return { year, month, days, updatedAt: new Date().toISOString() }

  // Phase 1
  const targets = calcTargetCounts(allDates, holidays, posts, activeGuards)
  const remaining: Record<string, Record<PostId, number>> = {}
  for (const g of activeGuards) remaining[g.id] = { ...targets[g.id] }

  // 預先算好每人的目標時數，供 Phase 2 做時數偏差修正
  const targetHours: Record<string, number> = {}
  for (const g of activeGuards) {
    targetHours[g.id] = posts.reduce((s, p) => s + targets[g.id][p.id] * p.hours, 0)
  }

  const weekdayPosts = posts.filter((p) => p.type === 'weekday').map((p) => p.id) as PostId[]
  const holidayPosts = posts.filter((p) => p.type === 'holiday').map((p) => p.id) as PostId[]
  const totalWeekdays = allDates.filter((d) => !holidays.includes(d) && !isWeekend(d)).length
  const totalHolidays = allDates.filter((d) => holidays.includes(d) || isWeekend(d)).length

  // Phase 2
  for (const date of allDates) {
    const isHoliday = holidays.includes(date) || isWeekend(date)
    const day: DaySchedule = { date, isHoliday, isTyphoon: false, assignments: [] }
    const requiredPosts = isHoliday ? holidayPosts : weekdayPosts
    const assigned = new Set<string>()

    const mustRestIds = new Set(
      activeGuards
        .filter((g) => countConsecutiveWorkDays(g.id, date, days) >= 6)
        .map((g) => g.id)
    )
    const eligible = activeGuards.filter((g) => !mustRestIds.has(g.id))

    const typeTotal = isHoliday ? totalHolidays : totalWeekdays
    const typeRemaining = isHoliday
      ? allDates.filter((d) => d >= date && (holidays.includes(d) || isWeekend(d))).length
      : allDates.filter((d) => d >= date && !holidays.includes(d) && !isWeekend(d)).length

    const urgency = (g: Guard, p: PostId): number => {
      const exp = typeTotal > 0 ? targets[g.id][p] * (typeRemaining / typeTotal) : 0
      return remaining[g.id][p] - exp
    }

    // 整體班次虧欠：該衛兵所有哨點緊迫度加總（衡量「今天是否該輪到我上班」）
    const assignmentDeficit = (g: Guard): number =>
      requiredPosts.reduce((s, p) => s + urgency(g, p), 0)

    const passesRules = (g: Guard, p: PostId): boolean =>
      getYesterdayPost(g.id, date, days) !== p &&
      (!isHoliday || isHolidayAssignmentValid(g.id, date, p, days))

    // 評分：哨點緊迫度（主）+ 整體班次虧欠（防止連續被擠掉）+ 規則懲罰 + 時數偏差修正
    // 時數偏差修正權重 2.0：保證 Phase 1 目標時數差（最高 ~10h）能有效傳遞到 Phase 2
    const score = (g: Guard, p: PostId): number =>
      urgency(g, p) * 10 +
      assignmentDeficit(g) * 3 +
      (passesRules(g, p) ? 0 : -100) -
      (computeCurrentHours(g.id, days, posts) - targetHours[g.id]) * 2.0

    // 回溯找最佳完整指派
    const bestAssignment = findOptimalDayAssignment(requiredPosts, eligible, score)

    for (const { guardId, postId } of bestAssignment) {
      assigned.add(guardId)
      remaining[guardId][postId] = Math.max(0, remaining[guardId][postId] - 1)
      day.assignments.push({ guardId, postId })
    }
    for (const g of activeGuards) {
      if (!assigned.has(g.id)) day.assignments.push({ guardId: g.id, postId: null })
    }

    days.push(day)
  }

  return { year, month, days, updatedAt: new Date().toISOString() }
}

// ─── 颱風假 ───────────────────────────────────────────────────────────────────

export function applyTyphoonDay(day: DaySchedule, _posts: Post[]): DaySchedule {
  const deGuards = day.assignments
    .filter((a) => a.postId === 'D' || a.postId === 'E')
    .map((a) => a.guardId)

  const holidayPostIds: PostId[] = ['F', 'G']
  const newAssignments: Assignment[] = []

  deGuards.forEach((guardId, i) => {
    newAssignments.push({ guardId, postId: holidayPostIds[i] ?? null })
  })
  for (const a of day.assignments) {
    if (!deGuards.includes(a.guardId)) newAssignments.push({ guardId: a.guardId, postId: null })
  }

  return {
    ...day,
    isTyphoon: true,
    isHoliday: true,
    assignments: newAssignments,
    originalAssignments: day.assignments,
  }
}
