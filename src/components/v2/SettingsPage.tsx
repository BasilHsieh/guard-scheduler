import { useRef, useState } from 'react'
import type { Guard, Post, PostId, PostType } from '../../types'
import { Icon } from '../../ui/icons'

interface Props {
  guards: Guard[]
  setGuards: (g: Guard[]) => void
  posts: Post[]
  setPosts: (p: Post[]) => void
}

function OfficersPanel({ guards, setGuards }: { guards: Guard[]; setGuards: (g: Guard[]) => void }) {
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  function addOfficer() {
    const name = draft.trim()
    if (!name) return
    const nums = guards
      .map(g => parseInt(g.id.replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n))
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    const id = 'g' + next
    setGuards([...guards, { id, name, active: true }])
    setDraft('')
    ref.current?.focus()
  }

  function updateName(id: string, name: string) {
    setGuards(guards.map(g => (g.id === id ? { ...g, name } : g)))
  }

  return (
    <div className="settings-panel">
      <h2>人員</h2>
      <p className="lead">共 {guards.length} 位 · 名字可編輯，新增後不可刪除（已排上去的班次需保留）</p>

      <table className="settings-table">
        <thead>
          <tr>
            <th style={{ width: 80 }}>ID</th>
            <th>姓名</th>
          </tr>
        </thead>
        <tbody>
          {guards.map(g => (
            <tr key={g.id}>
              <td><span className="mono" style={{ color: 'var(--ink-3)' }}>{g.id}</span></td>
              <td>
                <input type="text" value={g.name} onChange={e => updateName(g.id, e.target.value)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="settings-panel-foot">
        <div style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 360 }}>
          <input
            type="text"
            placeholder="新增人員姓名…"
            ref={ref}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addOfficer() }}
            style={{
              flex: 1,
              padding: '8px 10px',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-sm)',
              background: 'var(--bg-surface)',
              color: 'var(--ink-1)',
              fontSize: 13,
            }}
          />
          <button className="btn primary" onClick={addOfficer}>
            <Icon.Plus /> 新增
          </button>
        </div>
        <span className="hint">修改後將於下次重新排班時生效</span>
      </div>
    </div>
  )
}

function PostsPanel({ posts, setPosts }: { posts: Post[]; setPosts: (p: Post[]) => void }) {
  function update(id: PostId, field: 'hours' | 'type', value: number | PostType) {
    setPosts(posts.map(p => {
      if (p.id !== id) return p
      if (field === 'hours') return { ...p, hours: value as 10 | 12 }
      if (field === 'type') return { ...p, type: value as PostType }
      return p
    }))
  }

  return (
    <div className="settings-panel">
      <h2>哨點</h2>
      <p className="lead">共 {posts.length} 個哨點 · 時數、類型皆可編輯，不可刪除</p>

      <table className="settings-table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>代號</th>
            <th style={{ width: 120 }}>時數</th>
            <th style={{ width: 140 }}>類型</th>
          </tr>
        </thead>
        <tbody>
          {posts.map(p => (
            <tr key={p.id}>
              <td>
                <span
                  className="cell-chip"
                  style={{
                    background: `var(--post-${p.id}-bg, var(--bg-inset))`,
                    color: `var(--post-${p.id}-ink, var(--ink-1))`,
                  }}
                >{p.id}</span>
              </td>
              <td>
                <input
                  type="number" min={1} max={24} value={p.hours}
                  onChange={e => update(p.id, 'hours', +e.target.value || 0)}
                />
              </td>
              <td>
                <select value={p.type} onChange={e => update(p.id, 'type', e.target.value as PostType)}>
                  <option value="weekday">平日哨</option>
                  <option value="holiday">假日哨</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="settings-panel-foot">
        <span className="hint">時數和類型影響求解；修改後請重新產生排班</span>
      </div>
    </div>
  )
}

export default function SettingsPage({ guards, setGuards, posts, setPosts }: Props) {
  const [tab, setTab] = useState<'officers' | 'posts'>('officers')

  return (
    <div className="settings-page">
      <nav className="settings-nav">
        <button className={tab === 'officers' ? 'active' : ''} onClick={() => setTab('officers')}>
          <Icon.User /> 人員
        </button>
        <button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>
          <Icon.Post /> 哨點
        </button>
      </nav>

      {tab === 'officers'
        ? <OfficersPanel guards={guards} setGuards={setGuards} />
        : <PostsPanel posts={posts} setPosts={setPosts} />
      }
    </div>
  )
}
