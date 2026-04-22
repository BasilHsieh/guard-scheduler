import { describe, it, expect } from 'vitest'
import { generateSchedule, applyTyphoonDay } from './scheduler'
import { validateSchedule } from './validator'
import type { Guard, Post, DaySchedule } from '../types'

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

const GUARD_IDS = GUARDS.map(g => g.id)

// ─── 整合測試：完整月份排班 ───────────────────────────────────────────────────

describe('generateSchedule — 2025 年 1 月（無額外假日）', () => {
  const schedule = generateSchedule(2025, 1, GUARDS, POSTS, [])

  it('產生 31 天', () => {
    expect(schedule.days).toHaveLength(31)
  })

  it('每天的指派人數等於應出勤人數（平日 5 人、假日 2 人）', () => {
    for (const day of schedule.days) {
      const working = day.assignments.filter(a => a.postId !== null).length
      if (day.isHoliday) {
        expect(working).toBe(2)
      } else {
        expect(working).toBe(5)
      }
    }
  })

  it('每天不重複指派同一人到多個哨點', () => {
    for (const day of schedule.days) {
      const assignedIds = day.assignments
        .filter(a => a.postId !== null)
        .map(a => a.guardId)
      const unique = new Set(assignedIds)
      expect(unique.size).toBe(assignedIds.length)
    }
  })

  it('規則 1 & 2（連續上班 / 同哨點）：0 violations', () => {
    const v = validateSchedule(schedule, POSTS, GUARD_IDS)
    const structural = v.filter(
      x => x.type === 'consecutive_days' || x.type === 'consecutive_post'
    )
    expect(structural).toHaveLength(0)
  })

  it('規則 3 & 4（假日輪替）：0 violations', () => {
    const v = validateSchedule(schedule, POSTS, GUARD_IDS)
    const alternation = v.filter(
      x => x.type === 'holiday_day_alternation' || x.type === 'holiday_post_alternation'
    )
    expect(alternation).toHaveLength(0)
  })

  it('規則 5（時數平衡）：最大差距 ≤ 12h', () => {
    const v = validateSchedule(schedule, POSTS, GUARD_IDS)
    expect(v.filter(x => x.type === 'hours_imbalance')).toHaveLength(0)
  })
})

// ─── 颱風假 ───────────────────────────────────────────────────────────────────

describe('applyTyphoonDay', () => {
  const baseDay: DaySchedule = {
    date: '2025-01-06',
    isHoliday: false,
    isTyphoon: false,
    assignments: [
      { guardId: 'G1', postId: 'A' },
      { guardId: 'G2', postId: 'B' },
      { guardId: 'G3', postId: 'C' },
      { guardId: 'G4', postId: 'D' },
      { guardId: 'G5', postId: 'E' },
      { guardId: 'G6', postId: null },
    ],
  }

  it('颱風假後 isTyphoon = true', () => {
    const result = applyTyphoonDay(baseDay, POSTS)
    expect(result.isTyphoon).toBe(true)
  })

  it('D 班衛兵移至 F', () => {
    const result = applyTyphoonDay(baseDay, POSTS)
    expect(result.assignments.find(a => a.guardId === 'G4')?.postId).toBe('F')
  })

  it('E 班衛兵移至 G', () => {
    const result = applyTyphoonDay(baseDay, POSTS)
    expect(result.assignments.find(a => a.guardId === 'G5')?.postId).toBe('G')
  })

  it('A/B/C 班衛兵變為休假', () => {
    const result = applyTyphoonDay(baseDay, POSTS)
    expect(result.assignments.find(a => a.guardId === 'G1')?.postId).toBeNull()
    expect(result.assignments.find(a => a.guardId === 'G2')?.postId).toBeNull()
    expect(result.assignments.find(a => a.guardId === 'G3')?.postId).toBeNull()
  })

  it('原始排班儲存在 originalAssignments', () => {
    const result = applyTyphoonDay(baseDay, POSTS)
    expect(result.originalAssignments).toEqual(baseDay.assignments)
  })
})
