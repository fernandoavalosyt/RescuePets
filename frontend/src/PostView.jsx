import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import * as api from './api'
import PostCard from './PostCard'
import { navigate } from './useHashRoute'

/** Una sola publicación (enlace compartido): #/post/:id */
export default function PostView({ id }) {
  const [post, setPost] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPost(null)
    setError('')
    api.getPost(id).then((d) => !cancelled && setPost(d.post)).catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [id])

  return (
    <section className="mx-auto w-full max-w-3xl">
      <a href="#/" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline"><ArrowLeft className="h-4 w-4" /> Volver al inicio</a>
      {error && <p className="rounded-3xl bg-red-50 p-6 text-center text-red-700" role="alert">{error}</p>}
      {!post && !error && <p className="text-center text-sm text-[#133E37]/60">Cargando…</p>}
      {post && <PostCard post={post} onChange={setPost} onRemove={() => navigate('#/')} />}
    </section>
  )
}
