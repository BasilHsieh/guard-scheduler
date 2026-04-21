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
    <aside className="w-56 shrink-0 bg-slate-900 flex flex-col py-6 px-4">
      {/* 品牌 */}
      <div className="px-2 mb-8">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center text-white text-sm font-bold">
            保
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">保全排班</h1>
        </div>
      </div>

      <nav className="flex-1 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-2 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-widest">
              {section.title}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-all ${
                      current === item.id
                        ? 'bg-blue-500 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span>{item.label}</span>
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
