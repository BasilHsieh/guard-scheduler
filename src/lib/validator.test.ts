import { describe, it, expect } from 'vitest'
import { validateSchedule } from './validator'
import type { MonthSchedule, Post, Guard, DaySchedule, PostId } from '../types'

const GUARDS: Guard[] = [
  { id: 'G1', name: '王大明', active: true },
  { id: 'G2', name: '李小華', active: true },
  { id: 'G3', name: '張志偉', active: true },
  { id: 'G4', name: '陳美玲', active: true },
  { id: 'G5', name: '林建國', active: true },
  { id: 'G6', name: '吳雅婷', active: true },
]
const GUARD_IDS = GUARDS.map(g => g.id)

const POSTS: Post[] = [
  { id: 'A', type: 'weekday', hours: 10 },
  { id: 'B', type: 'weekday', hours: 10 },
  { id: 'C', type: 'weekday', hours: 10 },
  { id: 'D', type: 'weekday', hours: 12 },
  { id: 'E', type: 'weekday', hours: 12 },
  { id: 'F', type: 'holiday', hours: 12 },
  { id: 'G', type: 'holiday', hours: 12 },
]

function day(
  date: string,
  isHoliday: boolean,
  assignments: Partial<Record<string, PostId | null>>
): DaySchedule {
  return {
    date,
    isHoliday,
    isTyphoon: false,
    assignments: GUARD_IDS.map(id => ({
      guardId: id,
      postId: (assignments[id] ?? null) as PostId | null,
    })),
  }
}

function schedule(days: DaySchedule[]): MonthSchedule {
  return { year: 2025, month: 1, days, updatedAt: '' }
}

// ─── 規則 1：連續上班不超過 6 天 ──────────────────────────────────────────────

describe('規則 1 — 連續上班不超過 6 天', () => {
  it('連續工作 6 天：不報錯', () => {
    // 2025-01-06 (Mon) to 2025-01-11 (Sat)
    const days = [
      day('2025-01-06', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
      day('2025-01-07', false, { G1: 'B', G2: 'C', G3: 'D', G4: 'E', G5: 'A', G6: null }),
      day('2025-01-08', false, { G1: 'C', G2: 'D', G3: 'E', G4: 'A', G5: 'B', G6: null }),
      day('2025-01-09', false, { G1: 'D', G2: 'E', G3: 'A', G4: 'B', G5: 'C', G6: null }),
      day('2025-01-10', false, { G1: 'E', G2: 'A', G3: 'B', G4: 'C', G5: 'D', G6: null }),
      day('2025-01-11', true,  { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }),
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    expect(v.filter(x => x.type === 'consecutive_days')).toHaveLength(0)
  })

  it('連續工作 7 天：G1 在第 7 天觸發違規', () => {
    const days = [
      day('2025-01-06', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
      day('2025-01-07', false, { G1: 'B', G2: 'C', G3: 'D', G4: 'E', G5: 'A', G6: null }),
      day('2025-01-08', false, { G1: 'C', G2: 'D', G3: 'E', G4: 'A', G5: 'B', G6: null }),
      day('2025-01-09', false, { G1: 'D', G2: 'E', G3: 'A', G4: 'B', G5: 'C', G6: null }),
      day('2025-01-10', false, { G1: 'E', G2: 'A', G3: 'B', G4: 'C', G5: 'D', G6: null }),
      day('2025-01-11', true,  { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }),
      day('2025-01-12', true,  { G1: 'G', G2: 'F', G3: null, G4: null, G5: null, G6: null }),
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    const hits = v.filter(x => x.type === 'consecutive_days' && x.guardId === 'G1')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].date).toBe('2025-01-12')
  })
})

// ─── 規則 2：不重複相鄰哨點 ───────────────────────────────────────────────────

describe('規則 2 — 不重複相鄰哨點', () => {
  it('兩天輪流換哨：不報錯', () => {
    // A→B→C→D→E→A 輪轉，每個人前後哨點都不同
    const days = [
      day('2025-01-06', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
      day('2025-01-07', false, { G1: 'B', G2: 'C', G3: 'D', G4: 'E', G5: 'A', G6: null }),
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    expect(v.filter(x => x.type === 'consecutive_post')).toHaveLength(0)
  })

  it('連續兩天同哨點：G1 觸發違規', () => {
    const days = [
      day('2025-01-06', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
      day('2025-01-07', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    const hits = v.filter(x => x.type === 'consecutive_post' && x.guardId === 'G1')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].date).toBe('2025-01-07')
  })
})

// ─── 規則 3：假日星期交替（六 ↔ 日） ─────────────────────────────────────────

describe('規則 3 — 假日星期交替', () => {
  it('第一個假日（無前次）：不報錯', () => {
    const days = [
      day('2025-01-04', true, { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }),
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    expect(v.filter(x => x.type === 'holiday_day_alternation')).toHaveLength(0)
  })

  it('六→日交替：不報錯', () => {
    const days = [
      day('2025-01-04', true, { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }), // Sat
      day('2025-01-05', true, { G1: 'G', G2: 'F', G3: null, G4: null, G5: null, G6: null }), // Sun
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    expect(v.filter(x => x.type === 'holiday_day_alternation')).toHaveLength(0)
  })

  it('連續兩個週六上假日班：G1 觸發違規', () => {
    // G1 在 Jan 04 (六) 上班，Jan 05 (日) 休息，Jan 11 (六) 又上班
    // validator 往回找 G1 的前一個假日班 = Jan 04，同為週六 → 違規
    const days = [
      day('2025-01-04', true,  { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }), // Sat
      day('2025-01-05', true,  { G2: 'G', G1: null, G3: null, G4: null, G5: null, G6: null }), // Sun, G1 休息
      day('2025-01-11', true,  { G1: 'G', G2: 'F', G3: null, G4: null, G5: null, G6: null }), // Sat again
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    const hits = v.filter(x => x.type === 'holiday_day_alternation' && x.guardId === 'G1')
    expect(hits.length).toBeGreaterThan(0)
  })
})

// ─── 規則 4：假日哨點交替（F ↔ G） ───────────────────────────────────────────

describe('規則 4 — 假日哨點交替', () => {
  it('F → G 交替：不報錯', () => {
    const days = [
      day('2025-01-04', true, { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }), // Sat
      day('2025-01-05', true, { G1: 'G', G2: 'F', G3: null, G4: null, G5: null, G6: null }), // Sun
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    expect(v.filter(x => x.type === 'holiday_post_alternation')).toHaveLength(0)
  })

  it('連續兩個假日同哨點 F：G1 觸發違規', () => {
    const days = [
      day('2025-01-04', true, { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }), // Sat
      day('2025-01-05', true, { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }), // Sun (F again)
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    const hits = v.filter(x => x.type === 'holiday_post_alternation' && x.guardId === 'G1')
    expect(hits.length).toBeGreaterThan(0)
  })
})

// ─── 規則 5：時數平衡 ─────────────────────────────────────────────────────────

describe('規則 5 — 時數平衡', () => {
  it('所有人時數差距 ≤ 12h：不報錯', () => {
    // 3 天，G1-G5 各上一天（10h），G6 休息 → max=10, min=0, 差=10 ≤ 12 → OK
    const days = [
      day('2025-01-06', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    expect(v.filter(x => x.type === 'hours_imbalance')).toHaveLength(0)
  })

  it('時數差 > 12h：觸發違規', () => {
    // G1 上 A 3 次（30h），G6 休息（0h）→ 差距 30h > 12h → 違規
    const days = [
      day('2025-01-06', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
      day('2025-01-07', false, { G1: 'B', G2: 'A', G3: 'C', G4: 'D', G5: 'E', G6: null }),
      day('2025-01-08', false, { G1: 'C', G2: 'A', G3: 'B', G4: 'D', G5: 'E', G6: null }),
      day('2025-01-09', false, { G1: 'D', G2: 'A', G3: 'B', G4: 'C', G5: 'E', G6: null }),
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    const hits = v.filter(x => x.type === 'hours_imbalance')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some(x => x.guardId === 'G6')).toBe(true) // 最少
  })
})

// ─── 規則 6：哨點平均分配 ─────────────────────────────────────────────────────

describe('規則 6 — 哨點平均分配', () => {
  it('每人哨點差距 ≤ 1：不報錯', () => {
    // 假日兩天，每個哨點（F/G）各人最多差 1 次
    // Jan 04: G1=F, G2=G；Jan 05: G3=G, G4=F → F: G1,G4 各 1 次；G: G2,G3 各 1 次 → OK
    const days = [
      day('2025-01-04', true, { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }),
      day('2025-01-05', true, { G3: 'G', G4: 'F', G1: null, G2: null, G5: null, G6: null }),
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    expect(v.filter(x => x.type === 'post_imbalance')).toHaveLength(0)
  })

  it('某哨點分配差距 > 1：觸發違規', () => {
    // G1 上 A 3 次，其他人 0 次 → 差距 3 > 1 → 違規
    const days = [
      day('2025-01-06', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
      day('2025-01-07', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
      day('2025-01-08', false, { G1: 'A', G2: 'B', G3: 'C', G4: 'D', G5: 'E', G6: null }),
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    const hits = v.filter(x => x.type === 'post_imbalance')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some(x => x.guardId === 'G1')).toBe(true)
  })
})

// ─── 乾淨排班：完全不報錯 ─────────────────────────────────────────────────────

describe('乾淨排班', () => {
  it('無任何違規的 6 天排班：0 violations', () => {
    // 3 個週末，每對輪流（F↔G，六↔日），每人上 2 次，時數相等
    const days = [
      day('2025-01-04', true, { G1: 'F', G2: 'G', G3: null, G4: null, G5: null, G6: null }), // Sat
      day('2025-01-05', true, { G3: 'G', G4: 'F', G1: null, G2: null, G5: null, G6: null }), // Sun
      day('2025-01-11', true, { G5: 'F', G6: 'G', G1: null, G2: null, G3: null, G4: null }), // Sat
      day('2025-01-12', true, { G1: 'G', G2: 'F', G3: null, G4: null, G5: null, G6: null }), // Sun (G1: Sat→Sun ✓, F→G ✓)
      day('2025-01-18', true, { G3: 'F', G4: 'G', G1: null, G2: null, G5: null, G6: null }), // Sat (G3: Sun→Sat ✓, G→F ✓)
      day('2025-01-19', true, { G5: 'G', G6: 'F', G1: null, G2: null, G3: null, G4: null }), // Sun (G5: Sat→Sun ✓, F→G ✓)
    ]
    const v = validateSchedule(schedule(days), POSTS, GUARD_IDS)
    expect(v).toHaveLength(0)
  })
})
