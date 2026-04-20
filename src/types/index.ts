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
