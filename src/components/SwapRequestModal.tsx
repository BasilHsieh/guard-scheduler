/**
 * 調班單建立精靈（person-first flow）。
 *
 * 四個步驟：
 *   1. 選借班人（A）
 *   2. 選借班日（A 本月 ≥ 今天的上班日）
 *   3. 選代班人（B）
 *   4. 選還班日（B 當天有班、A 當天休、同工時；且 A/B 兩人接進去不違反基本規則）
 *
 * 確定後會呼叫 resolveSwap 嘗試求出新排班。無解則觸發 P5 建議邏輯。
 */

import { useMemo, useState } from 'react'
import type { MonthSchedule, Guard, Post, PostId, SwapRequest } from '../types'
import { isEditableDate } from '../lib/clock'
import { resolveSwap, findSwapSuggestions, makeSwapRequest, type SwapSuggestion } from '../lib/swap'

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
  schedule: MonthSchedule
  guards: Guard[]
  posts: Post[]
  holidays: string[]
  onClose: () => void
  onApply: (newSchedule: MonthSchedule, record: SwapRequest) => void
}

type Step = 1 | 2 | 3 | 4

export default function SwapRequestModal({
  schedule,
  guards,
  posts,
  holidays,
  onClose,
  onApply,
}: Props) {
  const [step, setStep] = useState<Step>(1)
  const [borrowerId, setBorrowerId] = useState<string | null>(null)
  const [borrowDate, setBorrowDate] = useState<string | null>(null)
  const [borrowPostId, setBorrowPostId] = useState<PostId | null>(null)
  const [substituteId, setSubstituteId] = useState<string | null>(null)
  const [paybackDate, setPaybackDate] = useState<string | null>(null)
  const [paybackPostId, setPaybackPostId] = useState<PostId | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SwapSuggestion[] | null>(null)

  const activeGuards = guards.filter((g) => g.active)

  // ── Step 2：借班日候選（A 上班、今天或未來、非颱風日） ─────────────
  const borrowDateOptions = useMemo(() => {
    if (!borrowerId) return []
    return schedule.days
      .filter((d) => isEditableDate(d.date))
      .filter((d) => !d.isTyphoon)
      .map((d) => {
        const a = d.assignments.find((x) => x.guardId === borrowerId)
        return a?.postId ? { date: d.date, postId: a.postId } : null
      })
      .filter((x): x is { date: string; postId: PostId } => x !== null)
  }, [borrowerId, schedule])

  // ── Step 3：代班人候選（借班日當天休、非借班者） ──────────────────
  const substituteOptions = useMemo(() => {
    if (!borrowDate || !borrowerId) return []
    const day = schedule.days.find((d) => d.date === borrowDate)
    if (!day) return []
    return activeGuards.filter((g) => {
      if (g.id === borrowerId) return false
      const a = day.assignments.find((x) => x.guardId === g.id)
      return !a?.postId
    })
  }, [borrowDate, borrowerId, activeGuards, schedule])

  // ── Step 4：還班日候選（B 有班、A 休、同工時、今天或未來） ───────
  const paybackOptions = useMemo(() => {
    if (!borrowDate || !borrowerId || !substituteId || !borrowPostId) return []
    const borrowHours = posts.find((p) => p.id === borrowPostId)?.hours
    if (!borrowHours) return []
    return schedule.days
      .filter((d) => d.date !== borrowDate)
      .filter((d) => isEditableDate(d.date))
      .filter((d) => !d.isTyphoon)
      .map((d) => {
        const aBorrower = d.assignments.find((x) => x.guardId === borrowerId)
        const aSub = d.assignments.find((x) => x.guardId === substituteId)
        if (aBorrower?.postId) return null
        if (!aSub?.postId) return null
        const postId = aSub.postId
        const payHours = posts.find((p) => p.id === postId)?.hours
        if (payHours !== borrowHours) return null
        return { date: d.date, postId }
      })
      .filter((x): x is { date: string; postId: PostId } => x !== null)
  }, [borrowDate, borrowerId, substituteId, borrowPostId, posts, schedule])

  function reset() {
    setStep(1)
    setBorrowerId(null)
    setBorrowDate(null)
    setBorrowPostId(null)
    setSubstituteId(null)
    setPaybackDate(null)
    setPaybackPostId(null)
    setErrorMessage(null)
    setSuggestions(null)
  }

  function handleSubmit() {
    if (!borrowerId || !borrowDate || !borrowPostId || !substituteId || !paybackDate || !paybackPostId) return
    setSubmitting(true)
    setErrorMessage(null)
    setSuggestions(null)

    // 用 setTimeout 讓 UI 有機會顯示 loading
    setTimeout(() => {
      const input = {
        baseline: schedule,
        borrowDate,
        borrowerId,
        borrowPostId,
        substituteId,
        paybackDate,
        paybackPostId,
      }
      const result = resolveSwap(input, guards, posts, holidays)
      if (result.ok && result.schedule) {
        const record = makeSwapRequest(input)
        onApply(result.schedule, record)
        setSubmitting(false)
        return
      }

      // 無解 → 顯示錯誤並掃描建議
      setErrorMessage(result.message ?? '無法求解')
      if (result.reason === 'no_solution') {
        const suggs = findSwapSuggestions(
          { baseline: schedule, borrowDate, borrowerId, borrowPostId },
          guards,
          posts,
          holidays
        )
        setSuggestions(suggs)
      }
      setSubmitting(false)
    }, 30)
  }

  function applySuggestion(s: SwapSuggestion) {
    // 建議本身已經通過 resolveSwap 驗證過，填好欄位後讓使用者再按「套用調班」
    setSubstituteId(s.substituteId)
    setPaybackDate(s.paybackDate)
    setPaybackPostId(s.paybackPostId)
    setErrorMessage(null)
    setSuggestions(null)
  }

  const borrowerName = borrowerId ? activeGuards.find((g) => g.id === borrowerId)?.name : null
  const substituteName = substituteId ? activeGuards.find((g) => g.id === substituteId)?.name : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[28rem] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-base font-bold text-gray-900">建立調班單</p>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition text-lg leading-none"
            >
              ×
            </button>
          </div>
          {/* 步驟指示器 */}
          <div className="flex items-center gap-1.5">
            {([1, 2, 3, 4] as const).map((s) => (
              <div key={s} className="flex items-center gap-1.5 flex-1">
                <span
                  className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                    step === s
                      ? 'bg-orange-500 text-white'
                      : step > s
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {step > s ? '✓' : s}
                </span>
                <span
                  className={`text-xs truncate ${
                    step === s ? 'text-gray-700 font-medium' : 'text-gray-400'
                  }`}
                >
                  {['借班人', '借班日', '代班人', '還班日'][s - 1]}
                </span>
              </div>
            ))}
          </div>
          {/* 摘要 */}
          {(borrowerName || borrowDate || substituteName || paybackDate) && (
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              {borrowerName && <span className="font-medium text-gray-700">{borrowerName}</span>}
              {borrowDate && <> 借 <strong>{borrowDate.slice(5).replace('-', '/')}</strong></>}
              {borrowPostId && (
                <span className={`inline-block ml-1 px-1.5 py-0.5 rounded font-bold text-xs ${POST_COLORS[borrowPostId]}`}>
                  {borrowPostId}
                </span>
              )}
              {substituteName && <> ← <span className="font-medium text-gray-700">{substituteName}</span> 代</>}
              {paybackDate && <>，還於 <strong>{paybackDate.slice(5).replace('-', '/')}</strong></>}
              {paybackPostId && (
                <span className={`inline-block ml-1 px-1.5 py-0.5 rounded font-bold text-xs ${POST_COLORS[paybackPostId]}`}>
                  {paybackPostId}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {step === 1 && (
            <>
              <p className="px-3 py-2 text-sm text-gray-500">選擇要請假的人員</p>
              <ul className="space-y-1">
                {activeGuards.map((g) => (
                  <li key={g.id}>
                    <button
                      onClick={() => {
                        setBorrowerId(g.id)
                        setStep(2)
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-orange-50 transition flex items-center justify-between group"
                    >
                      <span className="text-sm font-medium text-gray-700">{g.name}</span>
                      <span className="text-sm text-orange-400 opacity-0 group-hover:opacity-100 transition">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step === 2 && (
            <>
              <p className="px-3 py-2 text-sm text-gray-500">
                選擇借班日（僅列 {borrowerName} 本月今天或以後的上班日）
              </p>
              {borrowDateOptions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">本月已無可借班的日子</p>
              ) : (
                <ul className="space-y-1">
                  {borrowDateOptions.map(({ date, postId }) => (
                    <li key={date}>
                      <button
                        onClick={() => {
                          setBorrowDate(date)
                          setBorrowPostId(postId)
                          setStep(3)
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-orange-50 transition flex items-center justify-between group"
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {date.slice(5).replace('-', '/')}
                        </span>
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-xs ${POST_COLORS[postId]}`}>
                          {postId}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <p className="px-3 py-2 text-sm text-gray-500">
                選擇代班人（{borrowDate?.slice(5).replace('-', '/')} 當天休的人員）
              </p>
              {substituteOptions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">當天無人休息，無法代班</p>
              ) : (
                <ul className="space-y-1">
                  {substituteOptions.map((g) => (
                    <li key={g.id}>
                      <button
                        onClick={() => {
                          setSubstituteId(g.id)
                          setStep(4)
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-orange-50 transition flex items-center justify-between group"
                      >
                        <span className="text-sm font-medium text-gray-700">{g.name}</span>
                        <span className="text-sm text-orange-400 opacity-0 group-hover:opacity-100 transition">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <p className="px-3 py-2 text-sm text-gray-500">
                選擇還班日（{substituteName} 有班且同工時 {posts.find((p) => p.id === borrowPostId)?.hours}h）
              </p>
              {paybackOptions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">本月無符合條件的還班日</p>
              ) : (
                <ul className="space-y-1">
                  {paybackOptions.map(({ date, postId }) => (
                    <li key={date}>
                      <button
                        onClick={() => {
                          setPaybackDate(date)
                          setPaybackPostId(postId)
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between group ${
                          paybackDate === date
                            ? 'bg-green-50 ring-1 ring-green-300'
                            : 'hover:bg-green-50'
                        }`}
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {date.slice(5).replace('-', '/')}
                        </span>
                        <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-xs ${POST_COLORS[postId]}`}>
                          {postId}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* 錯誤 + 建議 */}
              {errorMessage && (
                <div className="mt-3 mx-2 p-3 rounded-xl bg-red-50 border border-red-100 text-sm">
                  <p className="text-red-600 font-medium mb-1">{errorMessage}</p>
                  {suggestions && suggestions.length > 0 && (
                    <>
                      <p className="text-xs text-gray-500 mt-2 mb-1.5">建議嘗試以下組合：</p>
                      <ul className="space-y-1">
                        {suggestions.map((s, i) => {
                          const subName = activeGuards.find((g) => g.id === s.substituteId)?.name
                          return (
                            <li key={i}>
                              <button
                                onClick={() => applySuggestion(s)}
                                className="w-full text-left px-2 py-1.5 rounded-lg bg-white hover:bg-green-50 text-xs transition flex items-center justify-between"
                              >
                                <span className="text-gray-700">
                                  {subName} 代 · 還於 {s.paybackDate.slice(5).replace('-', '/')}
                                </span>
                                <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${POST_COLORS[s.paybackPostId]}`}>
                                  {s.paybackPostId}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                  {suggestions && suggestions.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">已掃描其他組合，目前無可行方案</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 pt-2 pb-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
          {step > 1 && (
            <button
              onClick={() => {
                setErrorMessage(null)
                setSuggestions(null)
                if (step === 2) {
                  setBorrowerId(null)
                } else if (step === 3) {
                  setBorrowDate(null)
                  setBorrowPostId(null)
                } else if (step === 4) {
                  setSubstituteId(null)
                  setPaybackDate(null)
                  setPaybackPostId(null)
                }
                setStep((s) => (s - 1) as Step)
              }}
              className="flex-1 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-xl transition"
            >
              ← 上一步
            </button>
          )}
          <button
            onClick={() => {
              reset()
              onClose()
            }}
            className="flex-1 py-2 text-sm text-gray-400 hover:bg-gray-50 rounded-xl transition"
          >
            取消
          </button>
          {step === 4 && paybackDate && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-[1.5] py-2 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 rounded-xl transition"
            >
              {submitting ? '計算中…' : '套用調班'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
