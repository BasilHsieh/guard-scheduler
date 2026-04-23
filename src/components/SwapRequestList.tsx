/**
 * 本月調班單列表（P6）。
 *
 * MVP 僅呈現：時間、借班人、借班日/哨、代班人、還班日/哨。
 * 撤回功能目前 pending。
 */

import type { Guard, PostId, SwapRequest } from '../types'

const POST_COLORS: Record<PostId, string> = {
  A: 'bg-blue-100 text-blue-700',
  B: 'bg-indigo-100 text-indigo-700',
  C: 'bg-violet-100 text-violet-700',
  D: 'bg-cyan-100 text-cyan-700',
  E: 'bg-teal-100 text-teal-700',
  F: 'bg-orange-100 text-orange-700',
  G: 'bg-amber-100 text-amber-700',
}

interface Props {
  swapRequests: SwapRequest[]
  guards: Guard[]
}

export default function SwapRequestList({ swapRequests, guards }: Props) {
  const nameOf = (id: string) => guards.find((g) => g.id === id)?.name ?? id

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">本月調班紀錄</p>
        <span className="text-xs text-gray-400">{swapRequests.length} 筆</span>
      </div>
      {swapRequests.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">尚無調班紀錄</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {[...swapRequests]
            .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
            .map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">
                    <span className="font-semibold">{nameOf(r.borrowerId)}</span>
                    <span className="text-gray-400 mx-1">借</span>
                    <span className="font-medium">{r.borrowDate.slice(5).replace('-', '/')}</span>
                    <span
                      className={`inline-block ml-1 px-1.5 py-0.5 rounded font-bold text-xs ${POST_COLORS[r.borrowPostId]}`}
                    >
                      {r.borrowPostId}
                    </span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="font-semibold">{nameOf(r.substituteId)}</span>
                    <span className="text-gray-400 mx-1">代</span>
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(r.appliedAt).toLocaleString('zh-TW', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  還於{' '}
                  <span className="font-medium text-gray-700">
                    {r.paybackDate.slice(5).replace('-', '/')}
                  </span>
                  <span
                    className={`inline-block ml-1 px-1.5 py-0.5 rounded font-bold ${POST_COLORS[r.paybackPostId]}`}
                  >
                    {r.paybackPostId}
                  </span>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
