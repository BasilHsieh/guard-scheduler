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

  const content = {
    schedule: <SchedulePage />,
    records: <RecordsPage />,
    guards: <GuardsPage />,
    posts: <PostsPage />,
    calendar: <CalendarPage />,
  }[page]

  return (
    <div className="flex h-screen bg-gray-50 font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Display',sans-serif]">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto p-8">{content}</main>
    </div>
  )
}
