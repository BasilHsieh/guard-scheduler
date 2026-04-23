import { useEffect, useMemo, useState } from 'react'
import type { MonthSchedule, Guard, Post, PostId, SwapRequest } from './types'
import {
  getGuards, saveGuards,
  getPosts, savePosts,
  getCalendar,
  getSchedule, saveSchedule,
  getSwapRequests, appendSwapRequest,
} from './store'
import { generateSchedule } from './lib/scheduler'
import { validateSchedule, calcMonthlyHours, calcPostCounts, type Violation } from './lib/validator'
import { getDevTestState, setDevTestState } from './lib/clock'
import { ALL_POST_IDS } from './ui/constants'
import { toDisplayViolations, buildAuditRows } from './ui/helpers'
import { Icon } from './ui/icons'

import Topbar, { type Page, type View, type Theme } from './components/v2/Topbar'
import OverviewBar from './components/v2/OverviewBar'
import Matrix from './components/v2/Matrix'
import CalendarView from './components/v2/Calendar'
import ViolationAudit from './components/v2/ViolationAudit'
import SwapDrawer from './components/v2/SwapDrawer'
import SettingsPage from './components/v2/SettingsPage'
import DevPage from './components/v2/DevPage'
import TweaksPanel, { type Density } from './components/v2/TweaksPanel'

interface SelectedCell {
  guardId: string
  date: string
  postId: PostId
}

interface SimulatedToday {
  year: number
  month: number
  dom: number
}

function loadDevState(): { devMode: boolean; simulated: SimulatedToday | null } {
  const state = getDevTestState()
  if (!state.enabled) return { devMode: false, simulated: null }
  const [y, m, d] = state.today.split('-').map(Number)
  if (!y || !m || !d) return { devMode: false, simulated: null }
  return { devMode: true, simulated: { year: y, month: m, dom: d } }
}

export default function App() {
  const [page, setPage] = useState<Page>('schedule')
  const now = new Date()

  const [guards, setGuardsState] = useState<Guard[]>([])
  const [posts, setPostsState] = useState<Post[]>([])
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null)
  const [swapRequests, setSwapRequestsState] = useState<SwapRequest[]>([])
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [injectedViolations, setInjectedViolations] = useState<Violation[]>([])

  const [view, setView] = useState<View>('matrix')
  const [theme, setTheme] = useState<Theme>('light')
  const [density, setDensity] = useState<Density>('cozy')
  const [tweaksOpen, setTweaksOpen] = useState(false)

  const initialDev = useMemo(loadDevState, [])
  const [devMode, setDevMode] = useState(initialDev.devMode)
  const [simulatedToday, setSimulatedToday] = useState<SimulatedToday | null>(initialDev.simulated)
  const [solverAttempts, setSolverAttempts] = useState(500)

  const effSimulatedToday = devMode ? simulatedToday : null

  // Load guards/posts once
  useEffect(() => {
    setGuardsState(getGuards())
    setPostsState(getPosts())
  }, [])

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Load schedule when month changes
  useEffect(() => {
    setSchedule(getSchedule(month.year, month.month))
    setSwapRequestsState(getSwapRequests(month.year, month.month))
    setSelectedCell(null)
  }, [month.year, month.month])

  // Sync dev state to localStorage so clock's getToday() reflects it
  useEffect(() => {
    if (devMode && simulatedToday) {
      const t = `${simulatedToday.year}-${String(simulatedToday.month).padStart(2, '0')}-${String(simulatedToday.dom).padStart(2, '0')}`
      setDevTestState({ enabled: true, today: t })
    } else {
      setDevTestState({
        enabled: false,
        today: simulatedToday
          ? `${simulatedToday.year}-${String(simulatedToday.month).padStart(2, '0')}-${String(simulatedToday.dom).padStart(2, '0')}`
          : '',
      })
    }
  }, [devMode, simulatedToday])

  function setGuards(g: Guard[]) {
    setGuardsState(g)
    saveGuards(g)
  }

  function setPosts(p: Post[]) {
    setPostsState(p)
    savePosts(p)
  }

  function toggleTheme() {
    setTheme(t => (t === 'light' ? 'dark' : 'light'))
  }

  function onPrevMonth() {
    setMonth(m => {
      let mm = m.month - 1
      let yy = m.year
      if (mm < 1) { mm = 12; yy -= 1 }
      return { year: yy, month: mm }
    })
  }
  function onNextMonth() {
    setMonth(m => {
      let mm = m.month + 1
      let yy = m.year
      if (mm > 12) { mm = 1; yy += 1 }
      return { year: yy, month: mm }
    })
  }

  function onRegenerate() {
    const activeG = guards.filter(g => g.active)
    if (activeG.length === 0) return
    const cal = getCalendar(month.year)
    const holidays = cal?.holidays ?? []
    const result = generateSchedule(month.year, month.month, activeG, posts, holidays, {
      attempts: solverAttempts,
    })
    if (result.days.length > 0) {
      saveSchedule(result)
      setSchedule(result)
      setInjectedViolations([])
      setSelectedCell(null)
    }
  }

  function onRunScenario(kind: 'inject' | 'clear') {
    if (kind === 'clear') {
      setInjectedViolations([])
      return
    }
    if (!schedule) return
    const first = guards[0]
    const day = schedule.days[1]
    if (!first || !day) return
    setInjectedViolations([
      {
        date: day.date,
        guardId: first.id,
        type: 'consecutive_post',
        message: '模擬違規：示範用',
      },
    ])
  }

  function onExport(fmt: 'csv' | 'xlsx' | 'json') {
    alert(`匯出 ${fmt.toUpperCase()}（原型示範）`)
  }

  function handleSwapApplied(newSchedule: MonthSchedule, record: SwapRequest) {
    saveSchedule(newSchedule)
    setSchedule(newSchedule)
    appendSwapRequest(record)
    setSwapRequestsState(getSwapRequests(record.year, record.month))
    setSelectedCell(null)
  }

  const activeGuards = guards.filter(g => g.active)
  const cal = getCalendar(month.year)
  const holidays = cal?.holidays ?? []

  const hours: Record<string, number> = useMemo(() => {
    const h: Record<string, number> = {}
    for (const g of activeGuards) {
      h[g.id] = schedule ? calcMonthlyHours(g.id, schedule, posts) : 0
    }
    return h
  }, [schedule, activeGuards, posts])

  const postCounts: Record<string, Record<PostId, number>> = useMemo(() => {
    const res: Record<string, Record<PostId, number>> = {}
    for (const g of activeGuards) {
      res[g.id] = schedule
        ? calcPostCounts(g.id, schedule)
        : { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }
    }
    return res
  }, [schedule, activeGuards])

  const realViolations: Violation[] = useMemo(() => {
    if (!schedule) return []
    return validateSchedule(schedule, posts, activeGuards.map(g => g.id))
  }, [schedule, posts, activeGuards])

  const allViolations = useMemo(
    () => [...realViolations, ...injectedViolations],
    [realViolations, injectedViolations]
  )

  const displayViolations = useMemo(
    () => toDisplayViolations(allViolations, activeGuards),
    [allViolations, activeGuards]
  )

  const audits = useMemo(() => {
    if (!schedule) return []
    return buildAuditRows(schedule, posts, activeGuards.map(g => g.id), allViolations)
  }, [schedule, posts, activeGuards, allViolations])

  const violationKeys = useMemo(() => {
    const s = new Set<string>()
    for (const v of allViolations) {
      if (v.date) s.add(`${v.guardId}:${v.date}`)
    }
    return s
  }, [allViolations])

  const hourVals = Object.values(hours)
  const hoursSpread = hourVals.length ? Math.max(...hourVals) - Math.min(...hourVals) : 0

  const maxPostSpread = useMemo(() => {
    let max = 0
    for (const p of ALL_POST_IDS) {
      const vs = activeGuards.map(g => postCounts[g.id]?.[p] ?? 0)
      if (!vs.length) continue
      const sp = Math.max(...vs) - Math.min(...vs)
      if (sp > max) max = sp
    }
    return max
  }, [activeGuards, postCounts])

  const previewKeys = new Set<string>()

  return (
    <div className="app" data-density={density}>
      <Topbar
        page={page}
        setPage={setPage}
        month={month}
        view={view} setView={setView}
        theme={theme} toggleTheme={toggleTheme}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onExport={onExport}
        onRegenerate={onRegenerate}
      />

      {page === 'settings' ? (
        <SettingsPage guards={guards} setGuards={setGuards} posts={posts} setPosts={setPosts} />
      ) : page === 'dev' ? (
        <DevPage
          devMode={devMode}
          setDevMode={setDevMode}
          simulatedToday={simulatedToday}
          setSimulatedToday={setSimulatedToday}
          solverAttempts={solverAttempts}
          setSolverAttempts={setSolverAttempts}
          onRunScenario={onRunScenario}
        />
      ) : (
        <div className="app-body">
          <div className="main-col">
            {effSimulatedToday && (
              <div className="sim-today-banner">
                <span>🧪 開發模式：模擬今天 =</span>
                <span className="mono">
                  {effSimulatedToday.year}-
                  {String(effSimulatedToday.month).padStart(2, '0')}-
                  {String(effSimulatedToday.dom).padStart(2, '0')}
                </span>
              </div>
            )}

            {!schedule ? (
              <div className="main-card">
                <div className="swap-empty" style={{ padding: 64 }}>
                  <div className="icon" style={{ color: 'var(--ink-3)' }}><Icon.Table /></div>
                  <div>
                    {activeGuards.length === 0
                      ? '請先到設定頁新增人員'
                      : '本月尚未產生排班，點擊上方「產生排班」開始'}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <OverviewBar
                  schedule={schedule}
                  guards={activeGuards}
                  posts={posts}
                  violationsCount={allViolations.length}
                  hours={hours}
                  postCounts={postCounts}
                  hoursSpread={hoursSpread}
                  maxPostSpread={maxPostSpread}
                />

                {view === 'matrix' ? (
                  <Matrix
                    schedule={schedule}
                    guards={activeGuards}
                    posts={posts}
                    hours={hours}
                    violationKeys={violationKeys}
                    selectedCell={selectedCell}
                    setSelectedCell={setSelectedCell}
                    previewKeys={previewKeys}
                    simulatedToday={effSimulatedToday}
                  />
                ) : (
                  <CalendarView
                    schedule={schedule}
                    guards={activeGuards}
                    violationKeys={violationKeys}
                    selectedCell={selectedCell}
                    setSelectedCell={setSelectedCell}
                  />
                )}

                <ViolationAudit violations={displayViolations} audits={audits} />

                {swapRequests.length > 0 && (
                  <div className="main-card">
                    <div className="main-card-header">
                      <h2>調班紀錄 · 本月 {swapRequests.length} 筆</h2>
                    </div>
                    <div style={{ padding: '8px 16px 16px' }}>
                      {[...swapRequests]
                        .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
                        .map(r => {
                          const borrower = guards.find(g => g.id === r.borrowerId)
                          const sub = guards.find(g => g.id === r.substituteId)
                          return (
                            <div key={r.id} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '10px 12px', borderBottom: '1px solid var(--line-soft)',
                              fontSize: 13,
                            }}>
                              <span style={{ color: 'var(--ink-3)' }} className="mono">
                                {r.appliedAt.slice(0, 10)}
                              </span>
                              <span><strong>{borrower?.name}</strong> 借 <span className="mono">{r.borrowDate.slice(5)}</span> · {r.borrowPostId} 哨</span>
                              <Icon.Swap />
                              <span><strong>{sub?.name}</strong> 還 <span className="mono">{r.paybackDate.slice(5)}</span> · {r.paybackPostId} 哨</span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {schedule && (
        <SwapDrawer
          schedule={schedule}
          guards={activeGuards}
          posts={posts}
          holidays={holidays}
          selectedCell={selectedCell}
          setSelectedCell={setSelectedCell}
          simulatedToday={effSimulatedToday}
          onApply={handleSwapApplied}
        />
      )}

      <TweaksPanel
        visible={tweaksOpen}
        onClose={() => setTweaksOpen(false)}
        view={view} setView={setView}
        theme={theme} toggleTheme={toggleTheme}
        density={density} setDensity={setDensity}
      />

      <button
        className="tweaks-fab visible btn"
        style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 40 }}
        onClick={() => setTweaksOpen(v => !v)}
      >
        <Icon.Settings /> Tweaks
      </button>
    </div>
  )
}
