import { useState } from 'react'
import Sidebar from './Sidebar'
import SchedulePage from '../pages/SchedulePage'
import RecordsPage from '../pages/RecordsPage'
import GuardsPage from '../pages/GuardsPage'
import PostsPage from '../pages/PostsPage'
import CalendarPage from '../pages/CalendarPage'

export type Page = 'schedule' | 'records' | 'guards' | 'posts' | 'calendar'

export default function Layout() {
  const [page, setPage] = useState<Page>('calendar')
  const [scheduleNav, setScheduleNav] = useState<{ year: number; month: number } | null>(null)

  function navigateToSchedule(year: number, month: number) {
    setScheduleNav({ year, month })
    setPage('schedule')
  }

  function handleNavigate(p: Page) {
    if (p !== 'schedule') setScheduleNav(null)
    setPage(p)
  }

  const content = {
    schedule: <SchedulePage initialYear={scheduleNav?.year} initialMonth={scheduleNav?.month} />,
    records: <RecordsPage onNavigateToSchedule={navigateToSchedule} />,
    guards: <GuardsPage />,
    posts: <PostsPage />,
    calendar: <CalendarPage />,
  }[page]

  return (
    <div className="flex h-screen bg-gray-50 font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Display',sans-serif]">
      <Sidebar current={page} onNavigate={handleNavigate} />
      <main className="flex-1 overflow-y-auto p-8">{content}</main>
    </div>
  )
}
