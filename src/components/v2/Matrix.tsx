import type { MonthSchedule, Guard, Post, PostId } from '../../types'
import { POST_GROUPS } from '../../ui/constants'
import { dom, dowLabelOf, getAssignment, postHours } from '../../ui/helpers'

interface SelectedCell {
  guardId: string
  date: string
  postId: PostId
}

interface Props {
  schedule: MonthSchedule
  guards: Guard[]
  posts: Post[]
  hours: Record<string, number>
  violationKeys: Set<string> // `${guardId}:${date}`
  selectedCell: SelectedCell | null
  setSelectedCell: (c: SelectedCell | null) => void
  previewKeys?: Set<string>
  simulatedToday?: { year: number; month: number; dom: number } | null
}

export default function Matrix({
  schedule, guards, posts, hours, violationKeys,
  selectedCell, setSelectedCell, previewKeys,
  simulatedToday,
}: Props) {
  const now = simulatedToday ?? (() => {
    const n = new Date()
    return { year: n.getFullYear(), month: n.getMonth() + 1, dom: n.getDate() }
  })()

  const isPast = (date: string) => {
    const d = dom(date)
    if (schedule.year < now.year) return true
    if (schedule.year > now.year) return false
    if (schedule.month < now.month) return true
    if (schedule.month > now.month) return false
    return d < now.dom
  }
  const isToday = (date: string) =>
    schedule.year === now.year && schedule.month === now.month && dom(date) === now.dom

  return (
    <div className="main-card">
      <div className="main-card-header">
        <h2>班表矩陣 · {schedule.year}-{String(schedule.month).padStart(2, '0')}</h2>
        <div className="legend-inline">
          {POST_GROUPS.map(group => (
            <span key={group.label} style={{ display: 'contents' }}>
              {group.posts.map(pid => (
                <span key={pid} className="legend-chip">
                  <span className="dot" style={{ background: `var(--post-${pid}-bg)` }} />
                  <span className="label">{pid}</span>
                  <span className="hours">{postHours(posts, pid)}h</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="row-header" style={{ background: 'var(--bg-panel)' }}>人員</th>
              {schedule.days.map(d => {
                const past = isPast(d.date)
                const today = isToday(d.date)
                const thCls = [
                  d.isHoliday ? 'holiday' : '',
                  past ? 'past' : '',
                  today ? 'today-col' : '',
                ].filter(Boolean).join(' ')
                return (
                  <th key={d.date} className={thCls}>
                    <span className="dom">{dom(d.date)}</span>
                    <span className="dow">{dowLabelOf(d.date)}</span>
                  </th>
                )
              })}
              <th className="matrix-row-summary">月工時</th>
            </tr>
          </thead>
          <tbody>
            {guards.map(g => (
              <tr key={g.id}>
                <td className="row-header">{g.name}</td>
                {schedule.days.map(d => {
                  const post = getAssignment(schedule, d.date, g.id)
                  const k = `${g.id}:${d.date}`
                  const isSel =
                    selectedCell &&
                    selectedCell.guardId === g.id &&
                    selectedCell.date === d.date
                  const isViol = violationKeys.has(k)
                  const isPrev = previewKeys?.has(k) ?? false
                  const past = isPast(d.date)
                  const today = isToday(d.date)
                  const cls = [
                    'cell',
                    post ? `post-${post}` : 'off',
                    d.isHoliday ? 'holiday-col' : '',
                    isSel ? 'selected' : '',
                    isViol ? 'violation' : '',
                    isPrev ? 'preview-change' : '',
                    past ? 'locked' : '',
                    today ? 'today-col' : '',
                  ].filter(Boolean).join(' ')

                  return (
                    <td
                      key={d.date}
                      className={cls}
                      onClick={() => {
                        if (past) return
                        if (!post) return
                        if (isSel) {
                          setSelectedCell(null)
                        } else {
                          setSelectedCell({ guardId: g.id, date: d.date, postId: post })
                        }
                      }}
                      title={
                        past
                          ? `${g.name} · ${d.date} · 已發生班表，不可調整`
                          : post
                            ? `${g.name} · ${d.date} · ${post} 哨 · ${postHours(posts, post)}h`
                            : `${g.name} · ${d.date} · 休`
                      }
                    >
                      <div className="cell-inner">{post || '·'}</div>
                    </td>
                  )
                })}
                <td className="matrix-row-summary">{hours[g.id] ?? 0}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
