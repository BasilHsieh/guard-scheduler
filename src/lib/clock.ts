/**
 * 時鐘抽象層。全站所有「今天」的概念都必須走 getToday()，
 * 而不是直接 new Date()，這樣才能讓測試模式 override「當下日期」。
 *
 * Override 優先順序（由高到低）：
 *   1. URL query ?today=YYYY-MM-DD（臨時、一次性）
 *   2. localStorage 測試模式（持久化，透過「開發者設定」面板控制）
 *   3. 系統時間
 */

const DEV_KEYS = {
  enabled: 'dev_test_mode_enabled',
  today: 'dev_test_today',
}

function parseDateString(s: string): Date | null {
  // 只接受 YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

export function getToday(): Date {
  if (typeof window !== 'undefined') {
    // 1. URL query
    const params = new URLSearchParams(window.location.search)
    const q = params.get('today')
    if (q) {
      const d = parseDateString(q)
      if (d) return d
    }
    // 2. localStorage 測試模式
    try {
      const enabled = localStorage.getItem(DEV_KEYS.enabled) === 'true'
      if (enabled) {
        const stored = localStorage.getItem(DEV_KEYS.today)
        if (stored) {
          const d = parseDateString(stored)
          if (d) return d
        }
      }
    } catch {
      // localStorage 存取失敗 → fallback 到系統時間
    }
  }
  return new Date()
}

// ─── 開發者設定用 API ──────────────────────────────────────────────────

export interface DevTestState {
  enabled: boolean
  today: string  // 'YYYY-MM-DD'；enabled=false 時仍保留上次選擇
}

export function getDevTestState(): DevTestState {
  if (typeof window === 'undefined') {
    return { enabled: false, today: formatDate(new Date()) }
  }
  try {
    const enabled = localStorage.getItem(DEV_KEYS.enabled) === 'true'
    const today = localStorage.getItem(DEV_KEYS.today) ?? formatDate(new Date())
    return { enabled, today }
  } catch {
    return { enabled: false, today: formatDate(new Date()) }
  }
}

export function setDevTestState(state: DevTestState): void {
  try {
    localStorage.setItem(DEV_KEYS.enabled, String(state.enabled))
    if (state.today) localStorage.setItem(DEV_KEYS.today, state.today)
  } catch {
    // ignore
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 判斷目前是否有任何 override 生效（URL 或 localStorage），供 UI 顯示徽章用。
 */
export function isTestModeActive(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('today') && parseDateString(params.get('today')!)) return true
  try {
    return localStorage.getItem(DEV_KEYS.enabled) === 'true'
  } catch {
    return false
  }
}

/**
 * 回傳今天的 'YYYY-MM-DD' 字串（本地時區）。
 * 直接用 toISOString 會在 UTC+8 的台灣造成偏移，所以手動格式化。
 */
export function getTodayDateString(): string {
  const d = getToday()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 判斷一個 'YYYY-MM-DD' 是否是「今天以前」（嚴格小於）。
 */
export function isPastDate(dateStr: string): boolean {
  return dateStr < getTodayDateString()
}

/**
 * 判斷一個 'YYYY-MM-DD' 是否可被調整（今天或未來）。
 */
export function isEditableDate(dateStr: string): boolean {
  return !isPastDate(dateStr)
}
