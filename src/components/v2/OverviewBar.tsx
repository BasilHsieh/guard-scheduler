import { useState } from 'react'
import type { MonthSchedule, Guard, Post, PostId } from '../../types'
import { Icon } from '../../ui/icons'
import { ALL_POST_IDS } from '../../ui/constants'
import { postHours } from '../../ui/helpers'

interface Props {
  schedule: MonthSchedule
  guards: Guard[]
  posts: Post[]
  violationsCount: number
  hours: Record<string, number>
  postCounts: Record<string, Record<PostId, number>>
  hoursSpread: number
  maxPostSpread: number
}

function DistroList({
  guards, values, maxVal, minVal, unit,
}: {
  guards: Guard[]
  values: Record<string, number>
  maxVal: number
  minVal: number
  unit: string
}) {
  return (
    <div className="distro-list">
      {guards.map(g => {
        const v = values[g.id] ?? 0
        const isMax = v === maxVal
        const isMin = v === minVal && maxVal !== minVal
        const floor = Math.min(minVal, 0)
        const pct = ((v - floor) / (maxVal - floor + 1)) * 85 + 15
        return (
          <div key={g.id} className={`distro-row ${isMax ? 'max' : ''} ${isMin ? 'min' : ''}`}>
            <span className="name">{g.name}</span>
            <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
            <span className="val mono">{v}{unit}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function OverviewBar({
  schedule, guards, posts, violationsCount, hours, postCounts, hoursSpread, maxPostSpread,
}: Props) {
  const [tab, setTab] = useState<'hours' | 'posts'>('hours')

  const workdays = schedule.days.filter(d => !d.isHoliday && (new Date(d.date).getDay() !== 0 && new Date(d.date).getDay() !== 6)).length
  const holidays = schedule.days.length - workdays

  // 班次/時數需求（推估）
  let totalShifts = 0
  let totalHours = 0
  for (const post of posts) {
    const shifts = post.type === 'holiday' ? holidays : workdays
    totalShifts += shifts
    totalHours += shifts * postHours(posts, post.id)
  }

  const ok = violationsCount === 0 && hoursSpread <= 12 && maxPostSpread <= 1

  const hourVals = Object.values(hours).filter(h => h > 0)
  const maxH = hourVals.length ? Math.max(...hourVals) : 0
  const minH = hourVals.length ? Math.min(...hourVals) : 0
  const avgH = hourVals.length ? hourVals.reduce((a, b) => a + b, 0) / hourVals.length : 0

  const postSpreads: Record<PostId, { max: number; min: number; spread: number }> = {} as Record<PostId, { max: number; min: number; spread: number }>
  for (const p of ALL_POST_IDS) {
    const vs = guards.map(g => postCounts[g.id]?.[p] ?? 0)
    const max = vs.length ? Math.max(...vs) : 0
    const min = vs.length ? Math.min(...vs) : 0
    postSpreads[p] = { max, min, spread: max - min }
  }
  const worstPostId = ALL_POST_IDS.reduce((w, p) => postSpreads[p].spread > postSpreads[w].spread ? p : w, 'A' as PostId)

  const postVals: Record<string, number> = {}
  guards.forEach(g => { postVals[g.id] = postCounts[g.id]?.[worstPostId] ?? 0 })

  return (
    <div className="overview-bar">
      {/* 卡片 1 */}
      <div className={`ov-card ov-status ${ok ? 'ok' : 'bad'}`}>
        <div className="ov-status-head">
          <div className={`ov-mark ${ok ? 'ok' : 'bad'}`}>
            {ok ? <Icon.Check /> : <Icon.Alert />}
          </div>
          <div className="ov-status-text">
            <div className="headline">
              {ok ? <>班表檢查 <span className="accent-ok">通過</span></>
                  : <>班表 <span className="accent-bad">需要調整</span></>}
            </div>
            <div className="sub">
              {ok
                ? `六條規則全部通過，${schedule.year}-${String(schedule.month).padStart(2, '0')} 可以公告`
                : `有 ${violationsCount} 筆違規 · 工時差 ${hoursSpread}h · 哨點差 ${maxPostSpread}`}
            </div>
          </div>
        </div>

        <div className="ov-divider" />

        <div className="ov-status-grid">
          <div className="ov-kpi">
            <div className="k">人員</div>
            <div className="v mono">{guards.length}</div>
          </div>
          <div className="ov-kpi">
            <div className="k">工作天</div>
            <div className="v mono">{workdays}<span className="unit">/{workdays + holidays}</span></div>
          </div>
          <div className="ov-kpi">
            <div className="k">假日</div>
            <div className="v mono holiday-ink">{holidays}</div>
          </div>
          <div className="ov-kpi">
            <div className="k">總班次</div>
            <div className="v mono">{totalShifts}</div>
          </div>
          <div className="ov-kpi">
            <div className="k">總工時</div>
            <div className="v mono">{totalHours}<span className="unit">h</span></div>
          </div>
          <div className={`ov-kpi ${violationsCount ? 'bad' : ''}`}>
            <div className="k">違規</div>
            <div className="v mono">{violationsCount}</div>
          </div>
        </div>
      </div>

      {/* 卡片 2 */}
      <div className="ov-card ov-distro">
        <div className="ov-distro-head">
          <div className="ov-distro-title">
            <span>公平性分布</span>
            <span className="hint">差距越小越好</span>
          </div>
          <div className="distro-tabs">
            <button className={tab === 'hours' ? 'active' : ''} onClick={() => setTab('hours')}>
              月工時
              <span className={`tab-metric ${hoursSpread > 12 ? 'bad' : hoursSpread > 8 ? 'warn' : ''}`}>差 {hoursSpread}h</span>
            </button>
            <button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>
              哨點分布
              <span className={`tab-metric ${maxPostSpread > 1 ? 'bad' : ''}`}>差 {maxPostSpread}</span>
            </button>
          </div>
        </div>

        {tab === 'hours' ? (
          <>
            <DistroList guards={guards} values={hours} maxVal={maxH} minVal={minH} unit="h" />
            <div className="ov-distro-foot">
              <span>平均 <b className="mono">{avgH.toFixed(0)}h</b></span>
              <span>最多 <b className="mono">{maxH}h</b></span>
              <span>最少 <b className="mono">{minH}h</b></span>
              <span>差距 <b className="mono" style={{ color: hoursSpread > 12 ? 'var(--danger)' : 'inherit' }}>{hoursSpread}h</b></span>
            </div>
          </>
        ) : (
          <>
            <div className="post-filter-row">
              <span className="hint">當前顯示差距最大的哨點：</span>
              <span
                className="chip"
                style={{
                  background: `var(--post-${worstPostId}-bg)`,
                  color: `var(--post-${worstPostId}-ink)`,
                }}
              >{worstPostId}</span>
              <span className="hint mono">差 {postSpreads[worstPostId].spread}</span>
            </div>
            <DistroList
              guards={guards}
              values={postVals}
              maxVal={postSpreads[worstPostId].max}
              minVal={postSpreads[worstPostId].min}
              unit=" 班"
            />
          </>
        )}
      </div>
    </div>
  )
}
