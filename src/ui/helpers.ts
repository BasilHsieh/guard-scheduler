// 共用小工具 — 讓設計稿 JSX 的資料存取更順手

import type { MonthSchedule, Post, PostId, Guard } from '../types'
import type { Violation } from '../lib/validator'
import { DOW_LABEL } from './constants'

export function dom(date: string): number {
  return parseInt(date.slice(8), 10)
}

export function dowOf(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}

export function dowLabelOf(date: string): string {
  return DOW_LABEL[dowOf(date)]
}

export function isOffDay(date: string, schedule: MonthSchedule): boolean {
  const day = schedule.days.find(d => d.date === date)
  const weekend = dowOf(date) === 0 || dowOf(date) === 6
  return (day?.isHoliday ?? false) || weekend
}

export function getAssignment(schedule: MonthSchedule, date: string, guardId: string): PostId | null {
  const day = schedule.days.find(d => d.date === date)
  return day?.assignments.find(a => a.guardId === guardId)?.postId ?? null
}

export function postHours(posts: Post[], id: PostId): number {
  return posts.find(p => p.id === id)?.hours ?? 0
}

export function guardName(guards: Guard[], id: string): string {
  return guards.find(g => g.id === id)?.name ?? id
}

// 把 validator 回來的 Violation 轉成設計稿 UI 需要的格式
export interface DisplayViolation {
  id: string
  rule: number
  ruleName: string
  guardId: string
  guardName: string
  date: string
  dom: number | null
  message: string
  fix?: string
}

const RULE_META: Record<Violation['type'], { rule: number; name: string }> = {
  consecutive_days:         { rule: 1, name: '不超過連續 6 天上班' },
  consecutive_post:         { rule: 2, name: '同一哨點不連兩天' },
  holiday_day_alternation:  { rule: 3, name: '假日星期交替（六/日）' },
  holiday_post_alternation: { rule: 4, name: '假日哨點 F/G 交替' },
  hours_imbalance:          { rule: 5, name: '月工時差距 ≤ 12h' },
  post_imbalance:           { rule: 6, name: '每哨分配差距 ≤ 1' },
}

export function toDisplayViolations(violations: Violation[], guards: Guard[]): DisplayViolation[] {
  return violations.map((v, i) => {
    const meta = RULE_META[v.type]
    return {
      id: `v${i}`,
      rule: meta.rule,
      ruleName: meta.name,
      guardId: v.guardId,
      guardName: guardName(guards, v.guardId),
      date: v.date || '',
      dom: v.date ? dom(v.date) : null,
      message: v.message,
    }
  })
}

// 建立 6 條規則稽核資料（給 ViolationAudit 的 audits tab）
export interface AuditRow {
  rule: number
  name: string
  passed: boolean
  measured: string
  threshold: string
}

export function buildAuditRows(
  schedule: MonthSchedule,
  posts: Post[],
  guardIds: string[],
  violations: Violation[],
): AuditRow[] {
  const hours = Object.fromEntries(
    guardIds.map(id => [id, schedule.days.reduce((s, d) => {
      const a = d.assignments.find(x => x.guardId === id)
      return s + (a?.postId ? postHours(posts, a.postId) : 0)
    }, 0)])
  )
  const hourVals = Object.values(hours)
  const maxH = hourVals.length ? Math.max(...hourVals) : 0
  const minH = hourVals.length ? Math.min(...hourVals) : 0
  const hoursSpread = maxH - minH

  const postIds: PostId[] = ['A','B','C','D','E','F','G']
  const postSpreads: Record<PostId, number> = {} as Record<PostId, number>
  let maxPostSpread = 0
  for (const p of postIds) {
    const cs = guardIds.map(id => schedule.days.reduce((s, d) => {
      const a = d.assignments.find(x => x.guardId === id)
      return s + (a?.postId === p ? 1 : 0)
    }, 0))
    const sp = cs.length ? Math.max(...cs) - Math.min(...cs) : 0
    postSpreads[p] = sp
    if (sp > maxPostSpread) maxPostSpread = sp
  }

  const has = (t: Violation['type']) => violations.some(v => v.type === t)

  return [
    { rule: 1, name: '不超過連續 6 天上班',
      passed: !has('consecutive_days'),
      measured: has('consecutive_days') ? '有連續 7 天以上的人員' : '本月最長連續上班 ≤ 6 天',
      threshold: '≤ 6 天' },
    { rule: 2, name: '同一哨點不連兩天',
      passed: !has('consecutive_post'),
      measured: has('consecutive_post')
        ? `偵測到 ${violations.filter(v => v.type === 'consecutive_post').length} 次連續同哨`
        : '連續同哨 0 次',
      threshold: '0 次' },
    { rule: 3, name: '假日星期交替（六/日）',
      passed: !has('holiday_day_alternation'),
      measured: has('holiday_day_alternation')
        ? `未交替 ${violations.filter(v => v.type === 'holiday_day_alternation').length} 次`
        : '假日星期未交替 0 次',
      threshold: '0 次' },
    { rule: 4, name: '假日哨點 F/G 交替',
      passed: !has('holiday_post_alternation'),
      measured: has('holiday_post_alternation')
        ? `未交替 ${violations.filter(v => v.type === 'holiday_post_alternation').length} 次`
        : '假日哨點未交替 0 次',
      threshold: '0 次' },
    { rule: 5, name: '月工時差距 ≤ 12h',
      passed: hoursSpread <= 12,
      measured: `工時差距 ${hoursSpread}h（最高 ${maxH}、最低 ${minH}）`,
      threshold: '≤ 12h' },
    { rule: 6, name: '每哨分配差距 ≤ 1',
      passed: maxPostSpread <= 1,
      measured: `最大哨點分配差距 ${maxPostSpread} 班`,
      threshold: '≤ 1 班' },
  ]
}
