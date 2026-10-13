import { useCallback, useEffect, useState } from 'react'
import * as api from './api'
import PostList from './PostList'
import { usePagedPosts } from './useFeed'
import { useApp } from './AppContext'

export default function ProfileView({ username }) {
  const { user } = useApp()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(null)
    setError('')
    api.getUser(username).then((d) => !cancelled && setProfile(d.user)).catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [username])

  const fetchPage = useCallback((after) => api.getFeed({ user: username, limit: 9, cursor: after || undefined }), [username])
  const list = usePagedPosts(fetchPage, { enabled: !error })

  if (error) return <p className="mx-auto max-w-3xl rounded-3xl bg-red-50 p-6 text-center text-red-700" role="alert">{error}</p>

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#133E37] text-2xl font-black uppercase text-white" aria-hidden="true">
          {username[0]}
        </div>
        <div>
          <h1 className="text-2xl font-black">@{username}{profile && profile.id === user.id && <span className="ml-2 text-sm font-semibold text-[#133E37]/60">(tú)</span>}</h1>
          {profile && (
            <p className="text-sm text-[#133E37]/70">
              {profile.postCount} {profile.postCount === 1 ? 'publicación' : 'publicaciones'} · miembro desde {new Date(profile.createdAt).toLocaleDateString('es', { month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5">
        <PostList list={list} empty="Este usuario aún no tiene publicaciones." />
      </div>
    </section>
  )
}
