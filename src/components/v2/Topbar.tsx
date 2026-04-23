import { Icon } from '../../ui/icons'

export type Page = 'schedule' | 'settings' | 'dev'
export type View = 'matrix' | 'calendar'
export type Theme = 'light' | 'dark'

interface Props {
  page: Page
  setPage: (p: Page) => void
  month: { year: number; month: number }
  view: View
  setView: (v: View) => void
  theme: Theme
  toggleTheme: () => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onExport: (fmt: 'csv' | 'xlsx' | 'json') => void
  onRegenerate: () => void
}

export default function Topbar(p: Props) {
  const monthLabel = `${p.month.year}-${String(p.month.month).padStart(2, '0')}`
  const onSchedule = p.page === 'schedule'

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">保</div>
        <div className="topbar-title">
          保全排班工具
          <span className="sub">Security Scheduler · v2</span>
        </div>
      </div>

      <div className="topbar-page-tabs">
        <button className={p.page === 'schedule' ? 'active' : ''} onClick={() => p.setPage('schedule')}>
          <Icon.Table /> 班表
        </button>
        <button className={p.page === 'settings' ? 'active' : ''} onClick={() => p.setPage('settings')}>
          <Icon.Gear /> 設定
        </button>
        <button
          className={p.page === 'dev' ? 'active' : ''}
          onClick={() => p.setPage('dev')}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {'</>'} 開發
        </button>
      </div>

      {onSchedule && (
        <>
          <div className="topbar-month">
            <button onClick={p.onPrevMonth} aria-label="上月"><Icon.Chevron dir="left" /></button>
            <span className="label mono">{monthLabel}</span>
            <button onClick={p.onNextMonth} aria-label="下月"><Icon.Chevron dir="right" /></button>
          </div>

          <button className="btn" onClick={p.onRegenerate} title="重新產生當月班表">
            <Icon.Play /> 產生排班
          </button>

          <div className="view-switch">
            <button className={p.view === 'matrix' ? 'active' : ''} onClick={() => p.setView('matrix')}>矩陣視圖</button>
            <button className={p.view === 'calendar' ? 'active' : ''} onClick={() => p.setView('calendar')}>月曆視圖</button>
          </div>
        </>
      )}

      <div className="topbar-spacer" />

      <button className="icon-btn" onClick={p.toggleTheme} title="切換主題">
        {p.theme === 'light' ? <Icon.Moon /> : <Icon.Sun />}
      </button>
      {onSchedule && (
        <>
          <button className="btn" onClick={() => p.onExport('csv')}><Icon.Download /> CSV</button>
          <button className="btn" onClick={() => p.onExport('xlsx')}><Icon.Download /> Excel</button>
          <button className="btn primary" onClick={() => p.onExport('json')}>
            <Icon.Download /> 公告報表
          </button>
        </>
      )}
    </div>
  )
}
