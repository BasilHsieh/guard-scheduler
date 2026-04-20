import { useState, useEffect } from 'react'
import type { Post } from '../types'
import { getPosts, savePosts } from '../store'

const TYPE_LABEL = { weekday: '平日', holiday: '假日' }
const TYPE_COLOR = { weekday: 'bg-blue-50 text-blue-600', holiday: 'bg-orange-50 text-orange-600' }

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    setPosts(getPosts())
  }, [])

  function persist(updated: Post[]) {
    setPosts(updated)
    savePosts(updated)
  }

  function toggleHours(id: string) {
    persist(
      posts.map((p) =>
        p.id === id ? { ...p, hours: p.hours === 10 ? 12 : 10 } : p
      )
    )
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">哨點管理</h2>
      <p className="text-sm text-gray-500 mb-6">檢視哨點設定，可調整時數</p>

      <ul className="space-y-2">
        {posts.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl"
          >
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 flex items-center justify-center bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg">
                {p.id}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOR[p.type]}`}>
                {TYPE_LABEL[p.type]}
              </span>
            </div>
            <button
              onClick={() => toggleHours(p.id)}
              className="flex items-center gap-1 px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition"
            >
              <span className="font-medium text-gray-800">{p.hours}h</span>
              <span className="text-gray-400">切換</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-gray-400">
        點擊時數可在 10h / 12h 之間切換
      </p>
    </div>
  )
}
