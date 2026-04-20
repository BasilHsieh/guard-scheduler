import type { CalendarData } from '../types'
import { getCalendar, saveCalendar } from '../store'

const API_URL = (year: number) => `https://api.pin-yi.me/taiwan-calendar/${year}/`

interface ApiRecord {
  date: string       // 'YYYYMMDD'
  isHoliday: boolean
  caption: string
}

function parseDate(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function isWeekendDate(date: string): boolean {
  const d = new Date(date).getDay()
  return d === 0 || d === 6
}

async function fetchFromApi(year: number): Promise<{ holidays: string[]; holidayNames: Record<string, string> }> {
  const res = await fetch(API_URL(year))
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const records: ApiRecord[] = await res.json()

  const holidays: string[] = []
  const holidayNames: Record<string, string> = {}

  for (const r of records) {
    const date = parseDate(r.date)
    if (r.isHoliday && !isWeekendDate(date)) {
      holidays.push(date)
    }
    if (r.caption) {
      holidayNames[date] = r.caption
    }
  }

  return { holidays, holidayNames }
}

export async function loadCalendar(year: number): Promise<CalendarData> {
  try {
    const { holidays, holidayNames } = await fetchFromApi(year)
    const data: CalendarData = {
      year,
      holidays,
      holidayNames,
      source: 'api',
      lastUpdated: new Date().toISOString(),
    }
    saveCalendar(data)
    return data
  } catch {
    const cached = getCalendar(year)
    if (cached && cached.holidays.length > 0) return { ...cached, source: 'cache' }

    return {
      year,
      holidays: [],
      holidayNames: {},
      source: 'manual',
      lastUpdated: new Date().toISOString(),
    }
  }
}
