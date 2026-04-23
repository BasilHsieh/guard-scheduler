import type { MonthSchedule, Guard, PostId } from '../../types'
import { ALL_POST_IDS, DOW_LABEL } from '../../ui/constants'
import { dom, dowLabelOf, dowOf, guardName } from '../../ui/helpers'

interface SelectedCell {
  guardId: string
  date: string
  postId: PostId
}

interface Props {
  schedule: MonthSchedule
  guards: Guard[]
  violationKeys: Set<string> // `${guardId}:${date}`
  selectedCell: SelectedCell | null
  setSelectedCell: (c: SelectedCell | null) => void
}

export default function Calendar({
  schedule, guards, violationKeys, selectedCell, setSelectedCell,
}: Props) {
  const firstDate = schedule.days[0]?.date
  if (!firstDate) return null
  const firstDow = dowOf(firstDate)
  const blanks = Array.from({ length: firstDow })

  const violationDates = new Set(
    [...violationKeys].map(k => k.split(':')[1])
  )

  return (
    <div className="main-card">
      <div className="main-card-header">
        <h2>月曆視圖 · {schedule.year}-{String(schedule.month).padStart(2, '0')}</h2>
        <div className="legend-inline">
          {ALL_POST_IDS.map(pid => (
            <span key={pid} className="legend-chip">
              <span className="dot" style={{ background: `var(--post-${pid}-bg)` }} />
              <span className="label">{pid}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="calendar">
        <div className="cal-grid">
          {DOW_LABEL.map((d, i) => (
            <div key={d} className={`cal-dow ${i === 0 || i === 6 ? 'weekend' : ''}`}>{d}</div>
          ))}
          {blanks.map((_, i) => <div key={`b${i}`} className="cal-day blank" />)}
          {schedule.days.map(day => {
            const cellAssignments: { guardId: string; name: string; post: PostId }[] = []
            for (const g of guards) {
              const a = day.assignments.find(x => x.guardId === g.id)
              if (a?.postId) {
                cellAssignments.push({ guardId: g.id, name: guardName(guards, g.id), post: a.postId })
              }
            }
            cellAssignments.sort((a, b) => ALL_POST_IDS.indexOf(a.post) - ALL_POST_IDS.indexOf(b.post))

            return (
              <div
                key={day.date}
                className={`cal-day ${day.isHoliday ? 'holiday' : ''} ${violationDates.has(day.date) ? 'has-violation' : ''}`}
              >
                <div className="cal-day-head">
                  <span className="dom">{dom(day.date)}</span>
                  <span className="dow">{dowLabelOf(day.date)}{day.isHoliday ? ' · 假' : ''}</span>
                </div>
                <div className="cal-assignments">
                  {cellAssignments.map(a => {
                    const k = `${a.guardId}:${day.date}`
                    const isSel = selectedCell &&
                      selectedCell.guardId === a.guardId &&
                      selectedCell.date === day.date
                    const isViol = violationKeys.has(k)
                    return (
                      <div
                        key={a.guardId}
                        className={`cal-pill ${isSel ? 'selected' : ''}`}
                        onClick={() => setSelectedCell({ guardId: a.guardId, date: day.date, postId: a.post })}
                      >
                        <span className={`post post-${a.post}`}>{a.post}</span>
                        <span
                          className="name"
                          style={{ color: isViol ? 'var(--danger)' : undefined, fontWeight: isViol ? 700 : 500 }}
                        >
                          {a.name}{isViol ? ' !' : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
