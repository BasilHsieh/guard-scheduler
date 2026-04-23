import { useEffect, useMemo, useState } from 'react'
import type { MonthSchedule, Guard, Post, PostId, SwapRequest } from '../../types'
import { Icon } from '../../ui/icons'
import { postHours, dowLabelOf, dom, getAssignment } from '../../ui/helpers'
import { resolveSwap, makeSwapRequest, findSwapSuggestions, type SwapSuggestion } from '../../lib/swap'

interface SelectedCell {
  guardId: string
  date: string
  postId: PostId
}

interface Props {
  schedule: MonthSchedule
  guards: Guard[]
  posts: Post[]
  holidays: string[]
  selectedCell: SelectedCell | null
  setSelectedCell: (c: SelectedCell | null) => void
  simulatedToday?: { year: number; month: number; dom: number } | null
  onApply: (newSchedule: MonthSchedule, record: SwapRequest) => void
  onPreviewChange?: (p: { substituteId: string | null; paybackDate: string | null } | null) => void
}

// 淺層模擬 — 只換借班+還班兩格，用於預覽工時 & 差距（不做 CSP 求解）
function simulateSwapShallow(
  schedule: MonthSchedule,
  borrowDate: string,
  requesterId: string,
  substituteId: string,
  paybackDate: string | null,
): MonthSchedule {
  return {
    ...schedule,
    days: schedule.days.map(d => {
      if (d.date === borrowDate) {
        const borrowerAssign = d.assignments.find(a => a.guardId === requesterId)
        const borrowPost = borrowerAssign?.postId ?? null
        return {
          ...d,
          assignments: d.assignments.map(a => {
            if (a.guardId === requesterId) return { ...a, postId: null }
            if (a.guardId === substituteId) return { ...a, postId: borrowPost }
            return a
          }),
        }
      }
      if (paybackDate && d.date === paybackDate) {
        const subAssign = d.assignments.find(a => a.guardId === substituteId)
        const paybackPost = subAssign?.postId ?? null
        return {
          ...d,
          assignments: d.assignments.map(a => {
            if (a.guardId === substituteId) return { ...a, postId: null }
            if (a.guardId === requesterId) return { ...a, postId: paybackPost }
            return a
          }),
        }
      }
      return d
    }),
  }
}

function calcHours(schedule: MonthSchedule, posts: Post[], guards: Guard[]): Record<string, number> {
  const h: Record<string, number> = {}
  for (const g of guards) h[g.id] = 0
  for (const d of schedule.days) {
    for (const a of d.assignments) {
      if (a.postId) h[a.guardId] = (h[a.guardId] ?? 0) + postHours(posts, a.postId)
    }
  }
  return h
}

function detectNewRule2(before: MonthSchedule, after: MonthSchedule): string[] {
  const hits: string[] = []
  for (let i = 1; i < after.days.length; i++) {
    const prev = after.days[i - 1]
    const curr = after.days[i]
    for (const a of curr.assignments) {
      if (!a.postId) continue
      const prevA = prev.assignments.find(x => x.guardId === a.guardId)
      if (prevA?.postId === a.postId) {
        // 檢查 before 有沒有
        const beforePrev = before.days.find(d => d.date === prev.date)
          ?.assignments.find(x => x.guardId === a.guardId)?.postId
        const beforeCurr = before.days.find(d => d.date === curr.date)
          ?.assignments.find(x => x.guardId === a.guardId)?.postId
        if (beforePrev !== beforeCurr || beforePrev !== a.postId) {
          hits.push(`${a.guardId}|${prev.date}→${curr.date}|${a.postId}`)
        }
      }
    }
  }
  return hits
}

export default function SwapDrawer(p: Props) {
  const {
    schedule, guards, posts, holidays,
    selectedCell, setSelectedCell, simulatedToday,
    onApply, onPreviewChange,
  } = p

  const [substituteId, setSubstituteId] = useState<string | null>(null)
  const [paybackDate, setPaybackDate] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [failMessage, setFailMessage] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SwapSuggestion[]>([])
  const open = !!selectedCell

  const cellKey = selectedCell ? `${selectedCell.guardId}:${selectedCell.date}` : null

  // 切格時重置
  useEffect(() => {
    setSubstituteId(null)
    setPaybackDate(null)
    setFailMessage(null)
    setSuggestions([])
  }, [cellKey])

  // Esc 關閉
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedCell(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setSelectedCell])

  // preview 通知
  useEffect(() => {
    onPreviewChange?.(selectedCell ? { substituteId, paybackDate } : null)
  }, [selectedCell, substituteId, paybackDate, onPreviewChange])

  const borrowDay = selectedCell ? schedule.days.find(d => d.date === selectedCell.date) : null
  const requester = selectedCell ? guards.find(g => g.id === selectedCell.guardId) : null
  const borrowHours = selectedCell ? postHours(posts, selectedCell.postId) : 0

  const substitutes = useMemo(() => {
    if (!selectedCell || !borrowDay) return []
    return guards.filter(g => {
      if (g.id === selectedCell.guardId) return false
      const a = borrowDay.assignments.find(x => x.guardId === g.id)
      return !a?.postId
    })
  }, [selectedCell, borrowDay, guards])

  const now = simulatedToday ?? (() => {
    const n = new Date()
    return { year: n.getFullYear(), month: n.getMonth() + 1, dom: n.getDate() }
  })()

  const isPastDate = (date: string) => {
    const d = dom(date)
    if (schedule.year < now.year) return true
    if (schedule.year > now.year) return false
    if (schedule.month < now.month) return true
    if (schedule.month > now.month) return false
    return d < now.dom
  }

  const paybackCandidates = useMemo(() => {
    if (!selectedCell || !substituteId) return []
    return schedule.days.filter(d => {
      if (d.date === selectedCell.date) return false
      if (isPastDate(d.date)) return false
      const reqA = d.assignments.find(a => a.guardId === selectedCell.guardId)
      if (reqA?.postId) return false
      const subA = d.assignments.find(a => a.guardId === substituteId)
      if (!subA?.postId) return false
      if (postHours(posts, subA.postId) !== borrowHours) return false
      return true
    })
  }, [selectedCell, substituteId, schedule, posts, borrowHours])

  const scoredCandidates = useMemo(() => {
    if (!selectedCell || !substituteId) return []
    const hoursBefore = calcHours(schedule, posts, guards)
    const spreadBefore = Math.max(...Object.values(hoursBefore)) - Math.min(...Object.values(hoursBefore))
    return paybackCandidates.map(d => {
      const sim = simulateSwapShallow(schedule, selectedCell.date, selectedCell.guardId, substituteId, d.date)
      const hoursAfter = calcHours(sim, posts, guards)
      const spreadAfter = Math.max(...Object.values(hoursAfter)) - Math.min(...Object.values(hoursAfter))
      const newR2 = detectNewRule2(schedule, sim)
      return {
        day: d,
        spreadAfter,
        spreadBefore,
        delta: spreadAfter - spreadBefore,
        hasNewViolation: newR2.length > 0,
        substitutePost: d.assignments.find(a => a.guardId === substituteId)?.postId ?? null,
      }
    })
  }, [selectedCell, substituteId, paybackCandidates, schedule, posts, guards])

  const impact = useMemo(() => {
    if (!selectedCell || !substituteId) return null
    const before = schedule
    const after = simulateSwapShallow(before, selectedCell.date, selectedCell.guardId, substituteId, paybackDate)
    const hoursBefore = calcHours(before, posts, guards)
    const hoursAfter = calcHours(after, posts, guards)
    const hbArr = Object.values(hoursBefore)
    const haArr = Object.values(hoursAfter)
    const spreadBefore = Math.max(...hbArr) - Math.min(...hbArr)
    const spreadAfter = Math.max(...haArr) - Math.min(...haArr)
    const newR2 = detectNewRule2(before, after)
    return {
      requesterBefore: hoursBefore[selectedCell.guardId],
      requesterAfter: hoursAfter[selectedCell.guardId],
      substituteBefore: hoursBefore[substituteId],
      substituteAfter: hoursAfter[substituteId],
      spreadBefore,
      spreadAfter,
      newViolations: newR2,
    }
  }, [selectedCell, substituteId, paybackDate, schedule, posts, guards])

  const paybackPostId = (paybackDate && substituteId && selectedCell)
    ? getAssignment(schedule, paybackDate, substituteId)
    : null
  const canApply = !!(selectedCell && substituteId && paybackDate && paybackPostId && !applying)

  const spreadVerdict: 'ok' | 'same' | 'warn' | 'bad' | null = !impact ? null
    : impact.spreadAfter < impact.spreadBefore ? 'ok'
    : impact.spreadAfter === impact.spreadBefore ? 'same'
    : impact.spreadAfter > 12 ? 'bad' : 'warn'

  const hasNewViolation = !!impact && impact.newViolations.length > 0

  async function handleApply() {
    if (!selectedCell || !substituteId || !paybackDate || !paybackPostId) return
    setApplying(true)
    setFailMessage(null)
    setSuggestions([])
    try {
      const result = resolveSwap(
        {
          baseline: schedule,
          borrowDate: selectedCell.date,
          borrowerId: selectedCell.guardId,
          borrowPostId: selectedCell.postId,
          substituteId,
          paybackDate,
          paybackPostId,
        },
        guards, posts, holidays,
      )
      if (result.ok && result.schedule) {
        const record = makeSwapRequest({
          baseline: schedule,
          borrowDate: selectedCell.date,
          borrowerId: selectedCell.guardId,
          borrowPostId: selectedCell.postId,
          substituteId,
          paybackDate,
          paybackPostId,
        })
        onApply(result.schedule, record)
        setSelectedCell(null)
      } else {
        setFailMessage(result.message ?? '無法套用調班')
        if (result.reason === 'no_solution') {
          const sugg = findSwapSuggestions(
            {
              baseline: schedule,
              borrowDate: selectedCell.date,
              borrowerId: selectedCell.guardId,
              borrowPostId: selectedCell.postId,
            },
            guards, posts, holidays,
          )
          setSuggestions(sugg)
        }
      }
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <div className={`swap-backdrop ${open ? 'open' : ''}`} onClick={() => setSelectedCell(null)} />
      <aside className={`swap-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="swap-drawer-header">
          <div style={{ flex: 1 }}>
            <h2>調班精靈</h2>
            <div className="sub">點矩陣上其他格可直接切換 · Esc 關閉</div>
          </div>
          <button className="close-btn" onClick={() => setSelectedCell(null)} aria-label="關閉">
            <Icon.Close />
          </button>
        </div>

        <div className="swap-drawer-body">
          {open && selectedCell && borrowDay && requester && (
            <>
              {/* Step 1 */}
              <div className="swap-step">
                <div className="swap-step-title"><span className="num">1</span>借班格（已選）</div>
                <div className="swap-borrow-card">
                  <div className="date mono">
                    {selectedCell.date}
                    <br />
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)' }}>
                      {dowLabelOf(selectedCell.date)}{borrowDay.isHoliday ? '・假' : ''}
                    </span>
                  </div>
                  <div className="desc">
                    <strong>{requester.name}</strong> 原值 <strong>{selectedCell.postId}</strong> 哨
                    <span className="mono">（{borrowHours}h）</span>
                  </div>
                  <span className="legend-chip">
                    <span className="dot" style={{ background: `var(--post-${selectedCell.postId}-bg)` }} />
                    <span className="label mono">{selectedCell.postId}</span>
                  </span>
                </div>
              </div>

              {/* Step 2 */}
              <div className="swap-step">
                <div className="swap-step-title"><span className="num">2</span>代班人（當天休息的人）</div>
                {substitutes.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>這天沒有人休息可代班。</div>
                ) : (
                  <div className="sub-chip-group">
                    {substitutes.map(s => (
                      <button
                        key={s.id}
                        className={`sub-chip ${substituteId === s.id ? 'active' : ''}`}
                        onClick={() => setSubstituteId(s.id)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 3 */}
              {substituteId && (
                <div className="swap-step">
                  <div className="swap-step-title">
                    <span className="num">3</span>還班日（需同工時 {borrowHours}h）
                  </div>
                  {scoredCandidates.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--danger)' }}>找不到可行還班日，建議換代班人。</div>
                  ) : (
                    <div className="payback-list" style={{ maxHeight: 220 }}>
                      {(() => {
                        const minSpread = Math.min(...scoredCandidates.map(s => s.spreadAfter))
                        return scoredCandidates.map(s => {
                          const p = s.substitutePost
                          const isBest = s.spreadAfter === minSpread && !s.hasNewViolation
                          return (
                            <div
                              key={s.day.date}
                              className={`payback-row ${paybackDate === s.day.date ? 'active' : ''}`}
                              onClick={() => setPaybackDate(s.day.date)}
                            >
                              <span className="d">{s.day.date.slice(5)} {dowLabelOf(s.day.date)}</span>
                              <span style={{ fontSize: 11, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {s.day.isHoliday ? '假日 · ' : ''}
                                {s.hasNewViolation ? (
                                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠ 觸發違規</span>
                                ) : (
                                  <>
                                    差距 <span className="mono" style={{
                                      color: s.delta < 0 ? 'var(--ok)' : s.delta > 0 ? 'var(--warn)' : 'var(--ink-3)',
                                      fontWeight: 600,
                                    }}>{s.delta > 0 ? '+' : ''}{s.delta}h</span>
                                  </>
                                )}
                                {isBest && !s.hasNewViolation && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                                    padding: '1px 5px', borderRadius: 3,
                                    background: 'var(--ok-soft)', color: 'var(--ok)',
                                  }}>最佳</span>
                                )}
                              </span>
                              {p && (
                                <span
                                  className={`p post-${p}`}
                                  style={{ background: `var(--post-${p}-bg)`, color: `var(--post-${p}-ink)` }}
                                >{p}</span>
                              )}
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* 影響預覽 */}
              {impact && (
                <div className="impact-block">
                  <div className="impact-head">
                    調班影響預覽
                    {hasNewViolation ? (
                      <span className="verdict bad">觸發 {impact.newViolations.length} 筆新違規</span>
                    ) : spreadVerdict === 'ok' ? (
                      <span className="verdict ok">工時更平均</span>
                    ) : spreadVerdict === 'warn' ? (
                      <span className="verdict warn">工時差距變大</span>
                    ) : spreadVerdict === 'bad' ? (
                      <span className="verdict bad">工時差距超標</span>
                    ) : (
                      <span className="verdict" style={{ background: 'var(--bg-inset)', color: 'var(--ink-3)' }}>無變化</span>
                    )}
                  </div>

                  <div className="impact-rows">
                    <div className="impact-row">
                      <span className="lbl">{requester.name} 月工時</span>
                      <span className="delta">
                        <span className="from mono">{impact.requesterBefore}h</span>
                        <span className="arrow">→</span>
                        <span className="to mono">{impact.requesterAfter}h</span>
                      </span>
                      <span className={`badge ${impact.requesterAfter - impact.requesterBefore < 0 ? 'down' : impact.requesterAfter - impact.requesterBefore > 0 ? 'up' : 'same'}`}>
                        {impact.requesterAfter - impact.requesterBefore > 0 ? '+' : ''}
                        {impact.requesterAfter - impact.requesterBefore}h
                      </span>
                    </div>
                    <div className="impact-row">
                      <span className="lbl">
                        {guards.find(g => g.id === substituteId)?.name} 月工時
                      </span>
                      <span className="delta">
                        <span className="from mono">{impact.substituteBefore}h</span>
                        <span className="arrow">→</span>
                        <span className="to mono">{impact.substituteAfter}h</span>
                      </span>
                      <span className={`badge ${impact.substituteAfter - impact.substituteBefore < 0 ? 'down' : impact.substituteAfter - impact.substituteBefore > 0 ? 'up' : 'same'}`}>
                        {impact.substituteAfter - impact.substituteBefore > 0 ? '+' : ''}
                        {impact.substituteAfter - impact.substituteBefore}h
                      </span>
                    </div>
                    <div className="impact-row">
                      <span className="lbl">團隊工時差距</span>
                      <span className="delta">
                        <span className="from mono">{impact.spreadBefore}h</span>
                        <span className="arrow">→</span>
                        <span className="to mono">{impact.spreadAfter}h</span>
                      </span>
                      <span className={`badge ${
                        impact.spreadAfter < impact.spreadBefore ? 'down'
                        : impact.spreadAfter > impact.spreadBefore ? 'up' : 'same'
                      }`}>
                        {impact.spreadAfter > impact.spreadBefore ? '+' : ''}
                        {impact.spreadAfter - impact.spreadBefore}h
                      </span>
                    </div>
                    {!paybackDate && (
                      <div className="impact-row" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
                        <span className="lbl">還班日</span>
                        <span style={{ fontSize: 11 }}>尚未選擇 — 選完後會更新影響</span>
                        <span />
                      </div>
                    )}
                  </div>

                  {hasNewViolation && (
                    <div className="impact-warn">
                      <div className="title">⚠ 此調班會觸發新違規</div>
                      <ul>
                        {impact.newViolations.map((v, i) => (
                          <li key={i}><strong>規則 2・同一哨點連兩天</strong>：{v}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {failMessage && (
                <div className="impact-block">
                  <div className="impact-warn">
                    <div className="title">⚠ 套用失敗</div>
                    <div style={{ fontSize: 12 }}>{failMessage}</div>
                    {suggestions.length > 0 && (
                      <>
                        <div className="title" style={{ marginTop: 8 }}>可行的替代組合：</div>
                        <ul>
                          {suggestions.map((s, i) => (
                            <li key={i} style={{ cursor: 'pointer' }} onClick={() => {
                              setSubstituteId(s.substituteId)
                              setPaybackDate(s.paybackDate)
                              setFailMessage(null)
                            }}>
                              <strong>{guards.find(g => g.id === s.substituteId)?.name}</strong>
                              {' · 還班 '}<span className="mono">{s.paybackDate.slice(5)}</span>
                              {' · '}<span className="mono">{s.paybackPostId}</span> 哨
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="swap-drawer-footer">
          <button className="btn ghost" onClick={() => setSelectedCell(null)}>取消</button>
          <div style={{ flex: 1 }} />
          <button
            className="btn primary"
            disabled={!canApply}
            style={{ opacity: canApply ? 1 : 0.5 }}
            onClick={handleApply}
          >
            {applying ? '求解中…' : '套用調班並自動修復'}
          </button>
        </div>
      </aside>
    </>
  )
}
