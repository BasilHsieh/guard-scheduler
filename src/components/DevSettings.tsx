/**
 * 開發者設定面板：目前僅含「測試用今天日期」override。
 *
 * 設計決策：套用後直接 reload，簡單可靠（因為 getToday() 沒有 subscription 機制，
 * 各頁面的 useEffect/useMemo 依賴都需要重新計算才會反映新日期）。
 */

import { useEffect, useRef, useState } from 'react'
import { getDevTestState, setDevTestState } from '../lib/clock'

interface Props {
  open: boolean
  onClose: () => void
}

export default function DevSettings({ open, onClose }: Props) {
  const initial = getDevTestState()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [today, setToday] = useState(initial.today)
  const panelRef = useRef<HTMLDivElement>(null)

  // 開啟時重新抓 localStorage（使用者可能從別的分頁改過）
  useEffect(() => {
    if (open) {
      const s = getDevTestState()
      setEnabled(s.enabled)
      setToday(s.today)
    }
  }, [open])

  // 點面板外收起
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  if (!open) return null

  function save(nextEnabled: boolean, nextToday: string) {
    setDevTestState({ enabled: nextEnabled, today: nextToday })
    // reload 確保所有頁面 / hooks 重新讀取 getToday()
    window.location.reload()
  }

  function handleToggle() {
    const next = !enabled
    setEnabled(next)
    save(next, today)
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setToday(next)
    if (enabled) save(enabled, next)
    else setDevTestState({ enabled, today: next }) // 未啟用只存起來、不 reload
  }

  return (
    <div
      ref={panelRef}
      className="absolute left-full ml-2 bottom-0 z-50 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-900">開發者設定</p>
        <p className="text-xs text-gray-400 mt-0.5">測試用，不影響正式資料</p>
      </div>

      {/* 測試模式 toggle */}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700">測試模式：自訂今天日期</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
            開啟後「今天」會被鎖定成下方日期，方便測月底 / 跨月情境
          </p>
        </div>
        <button
          onClick={handleToggle}
          className={`relative w-10 h-6 rounded-full transition flex-shrink-0 ${
            enabled ? 'bg-red-500' : 'bg-gray-200'
          }`}
          aria-pressed={enabled}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* 日期輸入 */}
      <div className="px-4 pb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1.5">測試用今天日期</label>
        <input
          type="date"
          value={today}
          onChange={handleDateChange}
          className={`w-full px-3 py-2 border rounded-xl text-sm outline-none transition ${
            enabled
              ? 'border-gray-200 focus:border-red-300 bg-white text-gray-800'
              : 'border-gray-100 bg-gray-50 text-gray-400'
          }`}
        />
        {!enabled && (
          <p className="text-xs text-gray-400 mt-1.5">開啟測試模式後才會生效</p>
        )}
      </div>
    </div>
  )
}
