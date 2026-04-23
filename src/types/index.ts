export interface Guard {
  id: string
  name: string
  active: boolean
}

export type PostId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
export type PostType = 'weekday' | 'holiday'

export interface Post {
  id: PostId
  type: PostType
  hours: 10 | 12
}

export interface CalendarData {
  year: number
  holidays: string[]                  // 'YYYY-MM-DD'，只含非週末的國定假日
  holidayNames: Record<string, string> // date → 假日名稱
  source: 'api' | 'cache' | 'manual'
  lastUpdated: string
}

export interface Assignment {
  guardId: string
  postId: PostId | null // null = day off
}

export interface DaySchedule {
  date: string // 'YYYY-MM-DD'
  isHoliday: boolean
  isTyphoon: boolean
  assignments: Assignment[]
  originalAssignments?: Assignment[] // 套用颱風假前的原始排班
}

export interface MonthSchedule {
  year: number
  month: number
  days: DaySchedule[]
  updatedAt: string
}

export interface ScheduleIndex {
  year: number
  month: number
  updatedAt: string
}

/**
 * 調班單：一次「A 某日借班、B 代班、另一日還班」的完整紀錄。
 * 以此為單位追溯排班變動；受影響區間（借班日 → 月底）會被重新求解。
 */
export interface SwapRequest {
  id: string
  year: number
  month: number
  appliedAt: string      // ISO timestamp
  borrowDate: string     // 借班日 'YYYY-MM-DD'（A 請假的日子）
  borrowerId: string     // 原值班人（A）
  borrowPostId: PostId   // 借的哨點
  substituteId: string   // 代班人（B）
  paybackDate: string    // 還班日 'YYYY-MM-DD'（B 改休、A 上班）
  paybackPostId: PostId  // 還的哨點（B 原本那天值的哨點）
}
