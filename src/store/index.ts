import type { Guard, Post, PostId, CalendarData, MonthSchedule, ScheduleIndex } from '../types'

const KEYS = {
  guards: 'guards',
  posts: 'posts',
  calendarYear: (year: number) => `calendar_${year}`,
  schedule: (year: number, month: number) => `schedule_${year}_${month}`,
  schedulesIndex: 'schedules_index',
}

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

// Guards
const DEFAULT_GUARDS: Guard[] = [
  { id: 'g1', name: '王大明', active: true },
  { id: 'g2', name: '李小華', active: true },
  { id: 'g3', name: '張志偉', active: true },
  { id: 'g4', name: '陳美玲', active: true },
  { id: 'g5', name: '林建國', active: true },
  { id: 'g6', name: '吳雅婷', active: true },
]

export function getGuards(): Guard[] {
  return get<Guard[]>(KEYS.guards) ?? DEFAULT_GUARDS
}

export function saveGuards(guards: Guard[]): void {
  set(KEYS.guards, guards)
}

// Posts
const DEFAULT_POSTS: Post[] = [
  { id: 'A', type: 'weekday', hours: 10 },
  { id: 'B', type: 'weekday', hours: 10 },
  { id: 'C', type: 'weekday', hours: 10 },
  { id: 'D', type: 'weekday', hours: 12 },
  { id: 'E', type: 'weekday', hours: 12 },
  { id: 'F', type: 'holiday', hours: 12 },
  { id: 'G', type: 'holiday', hours: 12 },
]

export function getPosts(): Post[] {
  return get<Post[]>(KEYS.posts) ?? DEFAULT_POSTS
}

export function savePosts(posts: Post[]): void {
  set(KEYS.posts, posts)
}

// Calendar
export function getCalendar(year: number): CalendarData | null {
  const data = get<CalendarData>(KEYS.calendarYear(year))
  if (!data) return null
  // 相容舊格式（沒有 holidayNames）
  return { ...data, holidayNames: data.holidayNames ?? {} }
}

export function saveCalendar(data: CalendarData): void {
  set(KEYS.calendarYear(data.year), data)
}

// Schedules
export function getSchedule(year: number, month: number): MonthSchedule | null {
  return get<MonthSchedule>(KEYS.schedule(year, month))
}

export function saveSchedule(schedule: MonthSchedule): void {
  set(KEYS.schedule(schedule.year, schedule.month), schedule)
  updateScheduleIndex(schedule)
}

function updateScheduleIndex(schedule: MonthSchedule): void {
  const index = getScheduleIndex()
  const existing = index.findIndex(
    (s) => s.year === schedule.year && s.month === schedule.month
  )
  const entry: ScheduleIndex = {
    year: schedule.year,
    month: schedule.month,
    updatedAt: schedule.updatedAt,
  }
  if (existing >= 0) {
    index[existing] = entry
  } else {
    index.push(entry)
  }
  index.sort((a, b) => b.year - a.year || b.month - a.month)
  set(KEYS.schedulesIndex, index)
}

export function getScheduleIndex(): ScheduleIndex[] {
  return get<ScheduleIndex[]>(KEYS.schedulesIndex) ?? []
}

export function exportBackup(): string {
  const data: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    data[key] = get(key)
  }
  return JSON.stringify(data, null, 2)
}

export function importBackup(json: string): void {
  const data = JSON.parse(json) as Record<string, unknown>
  for (const [key, value] of Object.entries(data)) {
    set(key, value)
  }
}

export function getPostById(id: PostId): Post | undefined {
  return getPosts().find((p) => p.id === id)
}
