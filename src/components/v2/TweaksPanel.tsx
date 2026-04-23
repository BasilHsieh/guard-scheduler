import { Icon } from '../../ui/icons'
import type { View, Theme } from './Topbar'

export type Density = 'cozy' | 'compact'

interface Props {
  visible: boolean
  onClose: () => void
  view: View
  setView: (v: View) => void
  theme: Theme
  toggleTheme: () => void
  density: Density
  setDensity: (d: Density) => void
}

export default function TweaksPanel({
  visible, onClose, view, setView, theme, toggleTheme, density, setDensity,
}: Props) {
  if (!visible) return null
  return (
    <div className="tweaks-panel">
      <h3>
        Tweaks
        <span className="close" onClick={onClose}><Icon.Close /></span>
      </h3>
      <div className="tweak-row">
        <div className="label">主視圖</div>
        <div className="seg">
          <button className={view === 'matrix' ? 'active' : ''} onClick={() => setView('matrix')}>矩陣</button>
          <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>月曆</button>
        </div>
      </div>
      <div className="tweak-row">
        <div className="label">主題</div>
        <div className="seg">
          <button className={theme === 'light' ? 'active' : ''} onClick={() => theme !== 'light' && toggleTheme()}>淺色</button>
          <button className={theme === 'dark' ? 'active' : ''} onClick={() => theme !== 'dark' && toggleTheme()}>深色</button>
        </div>
      </div>
      <div className="tweak-row">
        <div className="label">矩陣密度</div>
        <div className="seg">
          <button className={density === 'cozy' ? 'active' : ''} onClick={() => setDensity('cozy')}>寬鬆</button>
          <button className={density === 'compact' ? 'active' : ''} onClick={() => setDensity('compact')}>緊湊</button>
        </div>
      </div>
    </div>
  )
}
