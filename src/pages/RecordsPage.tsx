import { useState, useEffect } from 'react'
import type { ScheduleIndex } from '../types'
import { getScheduleIndex, exportBackup, importBackup } from '../store'

const MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']

export default function RecordsPage() {
  const [index, setIndex] = useState<ScheduleIndex[]>([])

  useEffect(() => {
    setIndex(getScheduleIndex())
  }, [])

  function handleExportBackup() {
    const json = exportBackup()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `guard-scheduler-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        importBackup(ev.target?.result as string)
        setIndex(getScheduleIndex())
        alert('匯入成功')
      } catch {
        alert('匯入失敗，請確認檔案格式')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-semibold text-gray-900">排班記錄</h2>
        <div className="flex gap-2">
          <label className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg cursor-pointer transition">
            匯入備份
            <input type="file" accept=".json" className="hidden" onChange={handleImportBackup} />
          </label>
          <button
            onClick={handleExportBackup}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition"
          >
            匯出備份
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">所有已儲存的月份排班</p>

      {index.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">尚無排班記錄</p>
      ) : (
        <ul className="space-y-2">
          {index.map((s) => (
            <li
              key={`${s.year}-${s.month}`}
              className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl"
            >
              <span className="text-sm font-medium text-gray-900">
                {s.year} 年 {MONTHS[s.month - 1]} 月
              </span>
              <span className="text-xs text-gray-400">
                {new Date(s.updatedAt).toLocaleDateString('zh-TW')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
