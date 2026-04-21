import { useState, useEffect } from 'react'
import type { Guard } from '../types'
import { getGuards, saveGuards } from '../store'

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function GuardsPage() {
  const [guards, setGuards] = useState<Guard[]>([])
  const [newName, setNewName] = useState('')

  useEffect(() => {
    setGuards(getGuards())
  }, [])

  function persist(updated: Guard[]) {
    setGuards(updated)
    saveGuards(updated)
  }

  function addGuard() {
    const name = newName.trim()
    if (!name) return
    persist([...guards, { id: generateId(), name, active: true }])
    setNewName('')
  }

  function toggleActive(id: string) {
    persist(guards.map((g) => (g.id === id ? { ...g, active: !g.active } : g)))
  }

  function remove(id: string) {
    persist(guards.filter((g) => g.id !== id))
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">人員管理</h2>
      <p className="text-sm text-gray-500 mb-6">管理保全人員名單與在職狀態</p>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGuard()}
          placeholder="輸入姓名"
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
        />
        <button
          onClick={addGuard}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition"
        >
          新增
        </button>
      </div>

      {guards.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">尚無人員，請新增</p>
      ) : (
        <ul className="space-y-2">
          {guards.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${g.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                <span className={`text-sm font-medium ${g.active ? 'text-gray-900' : 'text-gray-400'}`}>
                  {g.name}
                </span>
                {!g.active && (
                  <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">已停用</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleActive(g.id)}
                  className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                >
                  {g.active ? '停用' : '啟用'}
                </button>
                <button
                  onClick={() => remove(g.id)}
                  className="px-3 py-1 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  刪除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {guards.length > 0 && (
        <p className="mt-4 text-sm text-gray-400">
          共 {guards.filter((g) => g.active).length} 位在職 / {guards.length} 位人員
        </p>
      )}
    </div>
  )
}
