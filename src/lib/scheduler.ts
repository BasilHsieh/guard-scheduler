import type { Guard, Post, DaySchedule, MonthSchedule, Assignment, PostId } from '../types'

// ─── 型別 ────────────────────────────────────────────────────────────────────

/**
 * 跨月銜接資料：上個月最後一天結束時每人的狀態。
 * 若省略，視為全部歸零（月初無任何限制）。
 */
export interface MonthContext {
  consecutive: Record<string, number>
  lastPost: Record<string, PostId | null>
  lastHolidayDow: Record<string, number | null>
  lastHolidayPost: Record<string, PostId | null>
}

interface RuntimeState {
  consecutive: Record<string, number>
  lastPost: Record<string, PostId | null>
  lastHolidayDow: Record<string, number | null>
  lastHolidayPost: Record<string, PostId | null>
  totalHours: Record<string, number>
  postCounts: Record<string, Record<PostId, number>>
  remaining: Record<string, Record<PostId, number>>
}

interface AttemptResult {
  days: DaySchedule[]
  hardViolations: number   // 0 = 所有硬約束滿足
  hoursSpread: number
  postExcessSum: number    // ∑ max(0, spread - 1) across all posts（門檻超額加總）
  postSpreadSum: number    // ∑ spread（絕對哨點差加總，tiebreak 用）
  diffCount: number        // 跟 baseline 不同的格子數（調班最小改動目標）
}

/**
 * 鎖定格子：用於調班場景。
 * 結構：date → guardId → postId（上班）或 null（休息）
 * 被鎖定的格子在求解時不會被更動，直接套用指定值。
 */
export type LockedCells = Record<string, Record<string, PostId | null>>

// ─── 日期工具 ────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const total = new Date(year, month, 0).getDate()
  for (let d = 1; d <= total; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

function dayOfWeek(date: string): number {
  return new Date(date).getDay()
}

function isWeekend(date: string): boolean {
  return [0, 6].includes(dayOfWeek(date))
}

// ─── RNG（mulberry32：seedable、輕量、品質足夠） ──────────────────────────────

function makeRng(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// shuffle 目前未使用（保留供未來擴充），以底線前綴避免 noUnusedLocals
function _shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
void _shuffle

// ─── Phase 1：配額計算 ───────────────────────────────────────────────────────
//
// 基礎配額 = ⌊總格數 / 人數⌋，把餘數按時數由高到低發給「目前多餘時數最少」者，
// 確保每哨點 base ≤ 1 差距、總時數盡量平均。

function calcTargetCounts(
  allDates: string[],
  holidays: string[],
  posts: Post[],
  guards: Guard[],
  rng?: () => number
): Record<string, Record<PostId, number>> {
  const N = guards.length
  const targets: Record<string, Record<PostId, number>> = {}
  const projectedHours: Record<string, number> = {}
  for (const g of guards) {
    targets[g.id] = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }
    projectedHours[g.id] = 0
  }

  // 對齊 Python solver._build_targets：逐哨點依序處理，每次依「當下累積預估時數」配 extras
  for (const post of posts) {
    const total = allDates.filter((d) =>
      post.type === 'holiday'
        ? holidays.includes(d) || isWeekend(d)
        : !holidays.includes(d) && !isWeekend(d)
    ).length
    const base = Math.floor(total / N)
    for (const g of guards) {
      targets[g.id][post.id] = base
      projectedHours[g.id] += base * post.hours
    }
    const extras = total % N
    if (extras === 0) continue
    const jitter = rng ?? Math.random
    const order = [...guards]
      .map((g) => ({ g, key: projectedHours[g.id], tie: jitter() }))
      .sort((a, b) => a.key - b.key || a.tie - b.tie)
      .map((x) => x.g)
    for (let i = 0; i < extras; i++) {
      const g = order[i]
      targets[g.id][post.id]++
      projectedHours[g.id] += post.hours
    }
  }

  return targets
}

// ─── 初始狀態 ────────────────────────────────────────────────────────────────

function initState(
  guards: Guard[],
  targets: Record<string, Record<PostId, number>>,
  carryOver: MonthContext | undefined
): RuntimeState {
  const state: RuntimeState = {
    consecutive: {},
    lastPost: {},
    lastHolidayDow: {},
    lastHolidayPost: {},
    totalHours: {},
    postCounts: {},
    remaining: {},
  }
  for (const g of guards) {
    state.consecutive[g.id] = carryOver?.consecutive[g.id] ?? 0
    state.lastPost[g.id] = carryOver?.lastPost[g.id] ?? null
    state.lastHolidayDow[g.id] = carryOver?.lastHolidayDow[g.id] ?? null
    state.lastHolidayPost[g.id] = carryOver?.lastHolidayPost[g.id] ?? null
    state.totalHours[g.id] = 0
    state.postCounts[g.id] = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }
    state.remaining[g.id] = { ...targets[g.id] }
  }
  return state
}

// ─── 硬約束過濾 ──────────────────────────────────────────────────────────────
//
// 回傳「給定 post，哪些 guards 可以合法指派」。
// 違反任一硬約束者直接排除（而非分數懲罰）。

function eligibleGuards(
  guards: Guard[],
  date: string,
  postId: PostId,
  isHoliday: boolean,
  state: RuntimeState
): Guard[] {
  const dow = dayOfWeek(date)
  const isHolidayPost = postId === 'F' || postId === 'G'

  return guards.filter((g) => {
    // 規則 1：連續 6 天必須休息
    if (state.consecutive[g.id] >= 6) return false
    // 規則 2：昨天同哨點不可再排
    if (state.lastPost[g.id] === postId) return false
    // 規則 3 & 4：假日 F/G 哨點的星期與哨點交替
    if (isHoliday && isHolidayPost) {
      if (state.lastHolidayDow[g.id] === dow) return false
      if (state.lastHolidayPost[g.id] === postId) return false
    }
    return true
  })
}

// ─── 評分（僅用於候選排序，不做硬判定） ─────────────────────────────────────
//
// 因為候選已通過硬過濾，這裡的分數決定「優先探索順序」：
//   deficit   配額落後越多 → 越優先（避免月底補不回來）
//   hourGap   已上總時數比他人少 → 略加分（時數平均）
//   streak    連續天數 → 略扣分（不要累到第 6 天）
//   jitter    小幅隨機 → 打破平手、配合多次重試

function scoreCandidate(
  g: Guard,
  postId: PostId,
  state: RuntimeState,
  targets: Record<string, Record<PostId, number>>,
  avgHours: number,
  rng: () => number
): number {
  // deficit 允許為負（已超過配額者扣分）—對齊 Python solver 的行為
  const deficit = targets[g.id][postId] - state.postCounts[g.id][postId]
  const hourGap = avgHours - state.totalHours[g.id]
  const streak = state.consecutive[g.id]
  const jitter = rng() * 0.05
  return deficit * 9 + hourGap * 0.8 - streak * 0.7 + jitter
}

// ─── 日內 backtracking：為當天所有必要哨點找合法且最佳的指派 ──────────────────

interface DayResult {
  assignments: { guardId: string; postId: PostId }[]
}

function solveDay(
  date: string,
  isHoliday: boolean,
  requiredPosts: PostId[],
  activeGuards: Guard[],
  state: RuntimeState,
  targets: Record<string, Record<PostId, number>>,
  avgHours: number,
  rng: () => number,
  locks?: Record<string, PostId | null>
): DayResult | null {
  const used = new Set<string>()
  const chosen: { guardId: string; postId: PostId }[] = []

  // 套用當日鎖定格子（調班場景）：
  //   guardId → postId    代表該人當天固定上此哨點
  //   guardId → null      代表該人當天固定休息
  // 被鎖定者不參與後續 backtracking
  const forcedPosts = new Set<PostId>()
  if (locks) {
    for (const [guardId, postId] of Object.entries(locks)) {
      used.add(guardId)
      if (postId !== null) {
        chosen.push({ guardId, postId })
        forcedPosts.add(postId)
      }
    }
  }
  const openPosts = requiredPosts.filter((p) => !forcedPosts.has(p))

  // 動態 most-constrained-first：每層遞迴時重新計算各哨點的剩餘候選人，
  // 挑候選最少的先排（對齊 Python solver.choose_next_post）
  function bt(remainingPosts: PostId[]): boolean {
    if (remainingPosts.length === 0) return true

    let bestPost: PostId | null = null
    let bestCandidates: Guard[] = []
    let bestCount = Infinity
    for (const p of remainingPosts) {
      const cs = eligibleGuards(activeGuards, date, p, isHoliday, state)
        .filter((g) => !used.has(g.id))
      if (cs.length < bestCount) {
        bestCount = cs.length
        bestPost = p
        bestCandidates = cs
      }
    }
    if (bestPost === null || bestCandidates.length === 0) return false

    // 評分並降序排列候選人
    const scored = bestCandidates
      .map((g) => ({ g, s: scoreCandidate(g, bestPost!, state, targets, avgHours, rng) }))
      .sort((a, b) => b.s - a.s)

    const nextRemaining = remainingPosts.filter((p) => p !== bestPost)
    for (const { g } of scored) {
      used.add(g.id)
      chosen.push({ guardId: g.id, postId: bestPost })
      if (bt(nextRemaining)) return true
      chosen.pop()
      used.delete(g.id)
    }
    return false
  }

  if (!bt(openPosts)) return null
  return { assignments: chosen }
}

// ─── 狀態轉移：套用一天的結果並更新 RuntimeState ─────────────────────────────

function applyDay(
  date: string,
  isHoliday: boolean,
  result: DayResult,
  activeGuards: Guard[],
  state: RuntimeState,
  posts: Post[]
): DaySchedule {
  const workedIds = new Set(result.assignments.map((a) => a.guardId))
  const postHours = new Map(posts.map((p) => [p.id, p.hours]))
  const dow = dayOfWeek(date)

  for (const { guardId, postId } of result.assignments) {
    state.consecutive[guardId] += 1
    state.lastPost[guardId] = postId
    state.totalHours[guardId] += postHours.get(postId) ?? 0
    state.postCounts[guardId][postId] += 1
    state.remaining[guardId][postId] = Math.max(0, state.remaining[guardId][postId] - 1)
    if (isHoliday && (postId === 'F' || postId === 'G')) {
      state.lastHolidayDow[guardId] = dow
      state.lastHolidayPost[guardId] = postId
    }
  }
  for (const g of activeGuards) {
    if (!workedIds.has(g.id)) {
      state.consecutive[g.id] = 0
      state.lastPost[g.id] = null
    }
  }

  const assignments: Assignment[] = activeGuards.map((g) => {
    const a = result.assignments.find((x) => x.guardId === g.id)
    return { guardId: g.id, postId: a ? a.postId : null }
  })

  return { date, isHoliday, isTyphoon: false, assignments }
}

// ─── 單次嘗試 ────────────────────────────────────────────────────────────────

function attemptSchedule(
  allDates: string[],
  holidays: string[],
  activeGuards: Guard[],
  posts: Post[],
  targets: Record<string, Record<PostId, number>>,
  carryOver: MonthContext | undefined,
  rng: () => number,
  lockedCells?: LockedCells
): DaySchedule[] | null {
  const state = initState(activeGuards, targets, carryOver)
  const weekdayPostIds = posts.filter((p) => p.type === 'weekday').map((p) => p.id) as PostId[]
  const holidayPostIds = posts.filter((p) => p.type === 'holiday').map((p) => p.id) as PostId[]

  const totalMonthHours = posts.reduce((s, p) => {
    const count = allDates.filter((d) =>
      p.type === 'holiday'
        ? holidays.includes(d) || isWeekend(d)
        : !holidays.includes(d) && !isWeekend(d)
    ).length
    return s + count * p.hours
  }, 0)
  const avgHoursTarget = totalMonthHours / activeGuards.length

  const days: DaySchedule[] = []
  for (const date of allDates) {
    const isHoliday = holidays.includes(date) || isWeekend(date)
    const required = isHoliday ? holidayPostIds : weekdayPostIds
    const locks = lockedCells?.[date]
    const result = solveDay(date, isHoliday, required, activeGuards, state, targets, avgHoursTarget, rng, locks)
    if (!result) return null
    days.push(applyDay(date, isHoliday, result, activeGuards, state, posts))
  }
  return days
}

// ─── 統計與品質比較 ──────────────────────────────────────────────────────────

function evaluateAttempt(
  days: DaySchedule[],
  posts: Post[],
  guards: Guard[],
  baseline?: MonthSchedule
): AttemptResult {
  const hours: Record<string, number> = {}
  const counts: Record<string, Record<PostId, number>> = {}
  for (const g of guards) {
    hours[g.id] = 0
    counts[g.id] = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }
  }
  const postHours = new Map(posts.map((p) => [p.id, p.hours]))
  for (const day of days) {
    for (const a of day.assignments) {
      if (!a.postId) continue
      hours[a.guardId] += postHours.get(a.postId) ?? 0
      counts[a.guardId][a.postId] += 1
    }
  }

  const hoursVals = Object.values(hours)
  const hoursSpread = hoursVals.length ? Math.max(...hoursVals) - Math.min(...hoursVals) : 0

  const postIds: PostId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  let postSpreadSum = 0
  let postExcessSum = 0
  for (const p of postIds) {
    const cs = guards.map((g) => counts[g.id][p])
    const spread = Math.max(...cs) - Math.min(...cs)
    postSpreadSum += spread
    postExcessSum += Math.max(0, spread - 1)
  }

  // diffCount：跟 baseline（調班前舊排班）比，有多少個 (date, guardId) 的 postId 不同
  // 只在調班場景會傳 baseline；一般新排班用預設值 0
  let diffCount = 0
  if (baseline) {
    const baselineMap = new Map<string, Map<string, PostId | null>>()
    for (const d of baseline.days) {
      const m = new Map<string, PostId | null>()
      for (const a of d.assignments) m.set(a.guardId, a.postId)
      baselineMap.set(d.date, m)
    }
    for (const d of days) {
      const bm = baselineMap.get(d.date)
      if (!bm) continue
      for (const a of d.assignments) {
        if (bm.get(a.guardId) !== a.postId) diffCount++
      }
    }
  }

  return { days, hardViolations: 0, hoursSpread, postExcessSum, postSpreadSum, diffCount }
}

// 字典序比較（對齊 Python solver._objective）：
//   硬違規 → 時數門檻超額 → 哨點門檻超額加總 → 跟 baseline 差異數 → 絕對時數差 → 絕對哨點差加總
// diffCount 只在調班場景有意義（一般新排班所有 attempts 都是 0，不會影響）
function isBetter(a: AttemptResult, b: AttemptResult): boolean {
  if (a.hardViolations !== b.hardViolations) return a.hardViolations < b.hardViolations
  const aHourExcess = Math.max(0, a.hoursSpread - 12)
  const bHourExcess = Math.max(0, b.hoursSpread - 12)
  if (aHourExcess !== bHourExcess) return aHourExcess < bHourExcess
  if (a.postExcessSum !== b.postExcessSum) return a.postExcessSum < b.postExcessSum
  if (a.diffCount !== b.diffCount) return a.diffCount < b.diffCount
  if (a.hoursSpread !== b.hoursSpread) return a.hoursSpread < b.hoursSpread
  return a.postSpreadSum < b.postSpreadSum
}

// ─── 公開 API ────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  carryOver?: MonthContext
  attempts?: number
  seed?: number
  /**
   * 鎖定格子：調班場景把「借班日 A=休 / B=上此哨、還班日 B=休 / A=上此哨」鎖住，
   * 其他日子自由重排。求解時被鎖的 cell 不會動。
   */
  lockedCells?: LockedCells
  /**
   * 基準排班：調班場景傳入「調班前的舊排班」，求解時會把與它的差異當成
   * 字典序比較中的一項軟目標（越少越好），達到「最小改動」的效果。
   */
  baseline?: MonthSchedule
}

export function generateSchedule(
  year: number,
  month: number,
  guards: Guard[],
  posts: Post[],
  holidays: string[],
  options: GenerateOptions = {}
): MonthSchedule {
  const activeGuards = guards.filter((g) => g.active)
  const allDates = getDaysInMonth(year, month)

  if (activeGuards.length === 0) {
    return { year, month, days: [], updatedAt: new Date().toISOString() }
  }

  const attempts = options.attempts ?? 1000
  const baseSeed = options.seed ?? Date.now()
  const targetsRng = makeRng(baseSeed)
  const targets = calcTargetCounts(allDates, holidays, posts, activeGuards, targetsRng)

  let best: AttemptResult | null = null

  for (let i = 0; i < attempts; i++) {
    const rng = makeRng(baseSeed + i * 2654435761)
    const days = attemptSchedule(
      allDates, holidays, activeGuards, posts, targets, options.carryOver, rng, options.lockedCells
    )

    if (!days) {
      // 當次 attempt 卡住（某天無合法候選）— 記為「最差」以便 fallback
      if (!best) {
        best = {
          days: [],
          hardViolations: 1,
          hoursSpread: Infinity,
          postExcessSum: Infinity,
          postSpreadSum: Infinity,
          diffCount: Infinity,
        }
      }
      continue
    }

    const evalResult = evaluateAttempt(days, posts, activeGuards, options.baseline)
    if (!best || isBetter(evalResult, best)) best = evalResult

    // 完美解提前結束：
    //   一般排班（無 baseline）— 硬違規 0、時數達標、哨點門檻達標即可
    //   調班場景（有 baseline）— 還需要等到 diff 無法再壓（保守起見，不 early exit）
    if (
      !options.baseline &&
      best.hardViolations === 0 &&
      best.hoursSpread <= 12 &&
      best.postExcessSum === 0
    ) break
  }

  if (!best || best.days.length === 0) {
    // 所有 attempts 都失敗（該月份硬約束無可行解）
    // 回傳空排班，讓上層 UI / validator 明確告知使用者
    return { year, month, days: [], updatedAt: new Date().toISOString() }
  }

  return { year, month, days: best.days, updatedAt: new Date().toISOString() }
}

// ─── 從上個月排班建立 carryOver（跨月銜接用） ───────────────────────────────

export function buildCarryOver(prev: MonthSchedule): MonthContext {
  const ctx: MonthContext = {
    consecutive: {},
    lastPost: {},
    lastHolidayDow: {},
    lastHolidayPost: {},
  }

  const guardIds = new Set<string>()
  for (const d of prev.days) for (const a of d.assignments) guardIds.add(a.guardId)

  for (const id of guardIds) {
    // 連續天數 = 從最後一天往前數，直到遇到休假
    let consec = 0
    for (let i = prev.days.length - 1; i >= 0; i--) {
      const a = prev.days[i].assignments.find((x) => x.guardId === id)
      if (a?.postId) consec++
      else break
    }
    ctx.consecutive[id] = consec

    // 最後一次上班的哨點
    let lastPost: PostId | null = null
    for (let i = prev.days.length - 1; i >= 0; i--) {
      const a = prev.days[i].assignments.find((x) => x.guardId === id)
      if (a?.postId) { lastPost = a.postId; break }
    }
    ctx.lastPost[id] = lastPost

    // 最後一次假日 F/G
    let holDow: number | null = null
    let holPost: PostId | null = null
    for (let i = prev.days.length - 1; i >= 0; i--) {
      const d = prev.days[i]
      if (!d.isHoliday) continue
      const a = d.assignments.find((x) => x.guardId === id)
      if (a?.postId && (a.postId === 'F' || a.postId === 'G')) {
        holDow = dayOfWeek(d.date)
        holPost = a.postId
        break
      }
    }
    ctx.lastHolidayDow[id] = holDow
    ctx.lastHolidayPost[id] = holPost
  }

  return ctx
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
