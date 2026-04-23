import { useState } from 'react'
import { Icon } from '../../ui/icons'
import type { DisplayViolation, AuditRow } from '../../ui/helpers'

interface Props {
  violations: DisplayViolation[]
  audits: AuditRow[]
}

export default function ViolationAudit({ violations, audits }: Props) {
  const [tab, setTab] = useState<'violations' | 'audits'>('violations')
  const failCount = audits.filter(a => !a.passed).length

  return (
    <div className="main-card">
      <div className="tabs">
        <div
          className={`tab ${tab === 'violations' ? 'active' : ''} ${violations.length ? 'has-danger' : ''}`}
          onClick={() => setTab('violations')}
        >
          違規清單 <span className="count">{violations.length}</span>
        </div>
        <div
          className={`tab ${tab === 'audits' ? 'active' : ''} ${failCount ? 'has-danger' : ''}`}
          onClick={() => setTab('audits')}
        >
          六條規則稽核 <span className="count">{audits.length - failCount}/{audits.length}</span>
        </div>
      </div>

      {tab === 'violations' && (
        <div className="violation-list">
          {violations.length === 0 ? (
            <div className="swap-empty">
              <div className="icon" style={{ color: 'var(--ok)' }}><Icon.Check /></div>
              <div>目前沒有違規，班表可直接公告。</div>
            </div>
          ) : (
            violations.map(v => (
              <div key={v.id} className="v-card">
                <div className="head">
                  <span className="rule">規則 {v.rule}　{v.ruleName}</span>
                  <span className="who">{v.guardName}{v.date ? ` · ${v.date}` : ''}</span>
                </div>
                <div className="msg">{v.message}</div>
                {v.fix && <div className="fix"><strong>如何解決</strong>：{v.fix}</div>}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'audits' && (
        <div className="rule-audit">
          {audits.map(a => (
            <div key={a.rule} className={`audit-row ${a.passed ? 'pass' : 'fail'}`}>
              <span className="dot" />
              <div>
                <div className="name">R{a.rule}　{a.name}</div>
                <div className="meas">{a.measured}　· 門檻 {a.threshold}</div>
              </div>
              <span className="badge">{a.passed ? 'PASS' : 'ALERT'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
