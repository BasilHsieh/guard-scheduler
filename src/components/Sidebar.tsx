import type { Page } from './Layout'

interface NavItem {
  id: Page
  label: string
  icon: string
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: '排班',
    items: [
      { id: 'calendar', label: '月曆', icon: '🗓️' },
      { id: 'schedule', label: '排班', icon: '📅' },
      { id: 'records', label: '記錄', icon: '🗂️' },
    ],
  },
  {
    title: '設定',
    items: [
      { id: 'guards', label: '人員', icon: '👤' },
      { id: 'posts', label: '哨點', icon: '📍' },
    ],
  },
]

interface Props {
  current: Page
  onNavigate: (page: Page) => void
}

export default function Sidebar({ current, onNavigate }: Props) {
  return (
    <aside className="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col py-6 px-3">
      <div className="px-3 mb-6">
        <h1 className="text-base font-semibold text-gray-900 tracking-tight">保全排班</h1>
      </div>

      <nav className="flex-1 space-y-5">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-1 text-xs font-medium text-gray-400 uppercase tracking-wider">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-left transition-colors ${
                      current === item.id
                        ? 'bg-blue-50 text-blue-600 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
