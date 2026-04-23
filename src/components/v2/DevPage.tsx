interface Props {
  devMode: boolean
  setDevMode: (v: boolean) => void
  simulatedToday: { year: number; month: number; dom: number } | null
  setSimulatedToday: (t: { year: number; month: number; dom: number } | null) => void
  solverAttempts: number
  setSolverAttempts: (n: number) => void
  onRunScenario: (kind: 'inject' | 'clear') => void
}

function RangeSlider({
  value, min, max, step, onChange, unit,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
  unit: string
}) {
  return (
    <div className="range-wrap">
      <div className="row">
        <span className="val mono">{value}<span className="unit">{unit}</span></span>
        <span className="range mono">{min} – {max}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />
    </div>
  )
}

export default function DevPage({
  devMode, setDevMode,
  simulatedToday, setSimulatedToday,
  solverAttempts, setSolverAttempts,
  onRunScenario,
}: Props) {
  const inputValue = simulatedToday
    ? `${simulatedToday.year}-${String(simulatedToday.month).padStart(2, '0')}-${String(simulatedToday.dom).padStart(2, '0')}`
    : ''

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (!v) { setSimulatedToday(null); return }
    const [y, m, d] = v.split('-').map(Number)
    setSimulatedToday({ year: y, month: m, dom: d })
  }

  function useRealToday() {
    const n = new Date()
    setSimulatedToday({ year: n.getFullYear(), month: n.getMonth() + 1, dom: n.getDate() })
  }

  return (
    <div className="dev-page">
      <div className="dev-page-header">
        <div className="dev-page-title-row">
          <span className="dev-badge mono">{'</>'}</span>
          <div>
            <h1>開發者模式</h1>
            <p>這個頁面僅供開發和測試使用，不會出現在正式環境。</p>
          </div>
          <div style={{ flex: 1 }} />
          <label className="dev-master-toggle">
            <input type="checkbox" checked={devMode} onChange={e => setDevMode(e.target.checked)} />
            <span className="track"><span className="thumb" /></span>
            <span className="lbl">{devMode ? '已啟用' : '未啟用'}</span>
          </label>
        </div>
      </div>

      <div className={`dev-sections ${devMode ? '' : 'dev-off'}`}>
        <section className="dev-section">
          <div className="dev-section-head">
            <h3>模擬「今天」</h3>
            <p>正常情況下系統抓取當天系統時間判斷哪些班表是歷史（不可改）。啟用此設定後，系統會改用此處指定的日期。</p>
          </div>
          <div className="dev-section-body">
            <div className="dev-field">
              <label>模擬日期</label>
              <div className="dev-field-row">
                <input type="date" value={inputValue} onChange={onInputChange} />
                <button className="btn sm" onClick={useRealToday}>回到今天</button>
                <button className="btn sm ghost" onClick={() => setSimulatedToday(null)} disabled={!simulatedToday}>
                  停用
                </button>
              </div>
              <div className="dev-status">
                {simulatedToday ? (
                  <span className="active">
                    <span className="dot" /> 已啟用 ·「今天」= <b className="mono">{inputValue}</b>
                  </span>
                ) : (
                  <span className="inactive">
                    <span className="dot" /> 未啟用 ·「今天」= <b className="mono">
                      {(() => {
                        const n = new Date()
                        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
                      })()}
                    </b>（系統時間）
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="dev-section">
          <div className="dev-section-head">
            <h3>求解嘗試次數</h3>
            <p>演算法在每次產生排班時會隨機嘗試多次並挑最好的結果。次數越多品質越穩定但會慢一些。</p>
          </div>
          <div className="dev-section-body">
            <div className="dev-field">
              <label>嘗試次數</label>
              <RangeSlider
                value={solverAttempts}
                min={100} max={3000} step={100}
                unit=" 次"
                onChange={setSolverAttempts}
              />
            </div>
          </div>
        </section>

        <section className="dev-section">
          <div className="dev-section-head">
            <h3>模擬情境</h3>
            <p>手動注入違規或清除，方便驗證 UI 呈現。</p>
          </div>
          <div className="dev-section-body">
            <div className="dev-field-row">
              <button className="btn" onClick={() => onRunScenario('inject')}>注入一筆違規</button>
              <button className="btn ghost" onClick={() => onRunScenario('clear')}>清除所有違規</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
