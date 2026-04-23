/**
 * 調班單求解。
 *
 * 輸入：baseline（舊排班）+ 借班/還班四格鎖定資料。
 * 輸出：可行的新排班（與 baseline 差異最小），或回報無解。
 *
 * 策略：
 *   1. 借班日「之前」的日子 → 全部鎖定為 baseline 原值（不允許變動）
 *   2. 借班日、還班日的兩個關鍵格子 → 鎖定成借班/還班後的狀態
 *   3. 其餘日子（借班日與還班日當天其他人、以及兩個日期之間的日子）→ 讓 scheduler 自由重排
 *   4. 以「跟 baseline 差異最少」為軟目標，達到最小改動
 *
 * 颱風日限制：若影響範圍內有颱風日，先拒絕；要調班請先還原颱風設定。
 */

import type { MonthSchedule, Guard, Post, PostId, SwapRequest } from '../types'
import { generateSchedule, type LockedCells } from './scheduler'

export interface SwapInput {
  baseline: MonthSchedule
  borrowDate: string
  borrowerId: string
  borrowPostId: PostId
  substituteId: string
  paybackDate: string
  paybackPostId: PostId
}

export type SwapFailReason =
  | 'typhoon_in_range'   // 影響範圍內有颱風日
  | 'no_solution'        // scheduler 找不到可行解
  | 'invalid_lock'       // 鎖定值與原排班矛盾（理論上不應發生）

export interface SwapResult {
  ok: boolean
  schedule?: MonthSchedule
  reason?: SwapFailReason
  message?: string
}

/**
 * 組出送給 scheduler 的 lockedCells。
 *
 * 結構：
 *   - 借班日前所有日期：全員鎖定為 baseline 值
 *   - 借班日：借班者=休、代班者=借班哨；其餘人由 scheduler 決定（但實務上幾乎不會動）
 *   - 還班日：借班者=還班哨、代班者=休；其餘人由 scheduler 決定
 *   - 借班日與還班日之間：完全不鎖，允許調整
 */
export function buildLockedCells(input: SwapInput): LockedCells {
  const locks: LockedCells = {}

  // 借班日之前 → 全鎖
  for (const d of input.baseline.days) {
    if (d.date >= input.borrowDate) continue
    locks[d.date] = {}
    for (const a of d.assignments) {
      locks[d.date][a.guardId] = a.postId
    }
  }

  // 借班日
  locks[input.borrowDate] = {
    [input.borrowerId]: null,
    [input.substituteId]: input.borrowPostId,
  }

  // 還班日
  locks[input.paybackDate] = {
    [input.borrowerId]: input.paybackPostId,
    [input.substituteId]: null,
  }

  return locks
}

/**
 * 嘗試求出套用某張調班單後的新排班。
 */
export function resolveSwap(
  input: SwapInput,
  guards: Guard[],
  posts: Post[],
  holidays: string[],
  attempts = 300
): SwapResult {
  // 颱風日前置檢查：影響範圍（借班日 → 月底）不可有颱風
  const affected = input.baseline.days.filter(
    (d) => d.date >= input.borrowDate && d.isTyphoon
  )
  if (affected.length > 0) {
    return {
      ok: false,
      reason: 'typhoon_in_range',
      message: `影響範圍內有颱風日（${affected.map((d) => d.date.slice(5)).join('、')}），請先還原颱風設定再調班`,
    }
  }

  const locks = buildLockedCells(input)

  const newSchedule = generateSchedule(
    input.baseline.year,
    input.baseline.month,
    guards,
    posts,
    holidays,
    {
      lockedCells: locks,
      baseline: input.baseline,
      attempts,
    }
  )

  if (newSchedule.days.length === 0) {
    return {
      ok: false,
      reason: 'no_solution',
      message: '目前組合下無可行解（可能違反連續天數或哨點交替）',
    }
  }

  // 保險：驗證鎖定確實生效
  const borrow = newSchedule.days.find((d) => d.date === input.borrowDate)
  const payback = newSchedule.days.find((d) => d.date === input.paybackDate)
  const borrowerAtBorrow = borrow?.assignments.find((a) => a.guardId === input.borrowerId)?.postId
  const substAtBorrow = borrow?.assignments.find((a) => a.guardId === input.substituteId)?.postId
  const borrowerAtPayback = payback?.assignments.find((a) => a.guardId === input.borrowerId)?.postId
  const substAtPayback = payback?.assignments.find((a) => a.guardId === input.substituteId)?.postId
  if (
    borrowerAtBorrow !== null ||
    substAtBorrow !== input.borrowPostId ||
    borrowerAtPayback !== input.paybackPostId ||
    substAtPayback !== null
  ) {
    return {
      ok: false,
      reason: 'invalid_lock',
      message: '鎖定套用失敗（內部錯誤）',
    }
  }

  return { ok: true, schedule: newSchedule }
}

/**
 * 建立 SwapRequest 記錄物件。
 */
export function makeSwapRequest(input: SwapInput): SwapRequest {
  return {
    id: `sw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    year: input.baseline.year,
    month: input.baseline.month,
    appliedAt: new Date().toISOString(),
    borrowDate: input.borrowDate,
    borrowerId: input.borrowerId,
    borrowPostId: input.borrowPostId,
    substituteId: input.substituteId,
    paybackDate: input.paybackDate,
    paybackPostId: input.paybackPostId,
  }
}

// ─── P5：無解時的替代方案建議 ─────────────────────────────────────────

export interface SwapSuggestion {
  substituteId: string
  paybackDate: string
  paybackPostId: PostId
}

/**
 * 固定「借班日 + 借班者 + 借班哨」，嘗試所有（代班人 × 還班日）組合，
 * 回傳第一批可行的建議（最多 maxSuggestions 筆）。
 *
 * 注意：每個組合會呼叫 scheduler 一次，attempts 要壓低（預設 50）避免太慢。
 */
export function findSwapSuggestions(
  partial: Omit<SwapInput, 'substituteId' | 'paybackDate' | 'paybackPostId'>,
  guards: Guard[],
  posts: Post[],
  holidays: string[],
  maxSuggestions = 3,
  attemptsPerCombo = 50
): SwapSuggestion[] {
  const suggestions: SwapSuggestion[] = []
  const { baseline, borrowDate, borrowerId, borrowPostId } = partial
  const borrowHours = posts.find((p) => p.id === borrowPostId)?.hours
  if (!borrowHours) return []

  // 候選代班人：借班日當天原本休的人（不含借班者）
  const borrowDay = baseline.days.find((d) => d.date === borrowDate)
  if (!borrowDay) return []
  const candidateSubs = guards.filter((g) => {
    if (g.id === borrowerId) return false
    const a = borrowDay.assignments.find((x) => x.guardId === g.id)
    return !a?.postId
  })

  // 候選還班日：借班日之後、本月內、借班者原本休、代班者當天有班、且哨點同工時
  for (const sub of candidateSubs) {
    for (const d of baseline.days) {
      if (d.date <= borrowDate) continue
      const borrowerA = d.assignments.find((a) => a.guardId === borrowerId)
      const subA = d.assignments.find((a) => a.guardId === sub.id)
      if (borrowerA?.postId) continue
      if (!subA?.postId) continue
      const paybackPostId = subA.postId
      const payHours = posts.find((p) => p.id === paybackPostId)?.hours
      if (payHours !== borrowHours) continue

      // 試算
      const result = resolveSwap(
        {
          baseline,
          borrowDate,
          borrowerId,
          borrowPostId,
          substituteId: sub.id,
          paybackDate: d.date,
          paybackPostId,
        },
        guards,
        posts,
        holidays,
        attemptsPerCombo
      )
      if (result.ok) {
        suggestions.push({
          substituteId: sub.id,
          paybackDate: d.date,
          paybackPostId,
        })
        if (suggestions.length >= maxSuggestions) return suggestions
      }
    }
  }

  return suggestions
}
