import type { PostId } from '../types'

export const DOW_LABEL = ['日', '一', '二', '三', '四', '五', '六'] as const

export const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
] as const

export const ALL_POST_IDS: PostId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export const POST_GROUPS: { label: string; posts: PostId[] }[] = [
  { label: '平日 10 時', posts: ['A', 'B', 'C'] },
  { label: '平日 12 時', posts: ['D', 'E'] },
  { label: '假日 12 時', posts: ['F', 'G'] },
]
