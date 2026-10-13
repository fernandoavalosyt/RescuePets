import { useEffect, useState } from 'react'
import { CornerDownRight, Trash2 } from 'lucide-react'
import * as api from './api'
import { timeAgo } from './lib'

function CommentItem({ c, postOwnerMine, onReply, onDelete, isReply }) {
  return (
    <div className={isReply ? 'ml-6 border-l-2 border-[#BCD2C6] pl-3' : ''}>
      <p className="text-sm">
        <span className="font-semibold">@{c.author.username}</span>{' '}
        <span className="whitespace-pre-wrap break-words">{c.content}</span>
      </p>
      <div className="mt-0.5 flex items-center gap-3 text-xs text-[#133E37]/60">
        <span>{timeAgo(c.createdAt)}</span>
        {!isReply && <button type="button" onClick={() => onReply(c)} className="font-semibold hover:underline">Responder</button>}
        {(c.mine || postOwnerMine) && (
          <button type="button" onClick={() => onDelete(c)} aria-label="Borrar comentario" className="inline-flex items-center gap-1 hover:text-red-600">
            <Trash2 className="h-3 w-3" /> Borrar
          </button>
        )}
      </div>
    </div>
  )
}

export default function Comments({ post, onCountChange }) {
  const [comments, setComments] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [sending, setSending] = useState(false)

  async function load(after) {
    setLoading(true)
    setError('')
    try {
      const data = await api.getComments(post.id, { limit: 20, cursor: after || undefined })
      setComments((prev) => (after ? [...prev, ...data.comments] : data.comments))
      setCursor(data.nextCursor)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])

  async function submit(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setError('')
    try {
      const { comment, commentCount } = await api.addComment(post.id, { content, parentId: replyTo?.id })
      setComments((prev) => [...prev, comment])
      onCountChange(commentCount)
      setText('')
      setReplyTo(null)
    } catch (err) {
      setError(err.fields?.content || err.fields?.parentId || err.message)
    } finally {
      setSending(false)
    }
  }

  async function remove(c) {
    if (!window.confirm('¿Borrar este comentario?')) return
    try {
      const { commentCount } = await api.deleteComment(c.id)
      // El servidor borra también las respuestas (cascada)
      setComments((prev) => prev.filter((x) => x.id !== c.id && x.parentId !== c.id))
      onCountChange(commentCount)
    } catch (err) {
      setError(err.message)
    }
  }

  const top = comments.filter((c) => !c.parentId)
  const repliesOf = (id) => comments.filter((c) => c.parentId === id)

  return (
    <div className="mt-3 border-t border-[#BCD2C6]/60 pt-3">
      {loading && !comments.length && <p className="text-sm text-[#133E37]/60">Cargando comentarios…</p>}
      {!loading && !comments.length && !error && <p className="text-sm text-[#133E37]/60">Sé el primero en comentar.</p>}

      <ul className="space-y-3">
        {top.map((c) => (
          <li key={c.id} className="space-y-2">
            <CommentItem c={c} postOwnerMine={post.mine} onReply={setReplyTo} onDelete={remove} />
            {repliesOf(c.id).map((r) => (
              <CommentItem key={r.id} c={r} postOwnerMine={post.mine} onReply={setReplyTo} onDelete={remove} isReply />
            ))}
          </li>
        ))}
      </ul>

      {cursor && (
        <button type="button" onClick={() => load(cursor)} disabled={loading} className="mt-2 text-sm font-semibold underline">
          Ver más comentarios
        </button>
      )}

      <form onSubmit={submit} className="mt-3">
        {replyTo && (
          <p className="mb-1 flex items-center gap-1 text-xs text-[#133E37]/70">
            <CornerDownRight className="h-3 w-3" /> Respondiendo a @{replyTo.author.username}
            <button type="button" onClick={() => setReplyTo(null)} className="ml-1 underline">cancelar</button>
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Escribe un comentario…"
            aria-label="Escribe un comentario"
            className="min-w-0 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:border-[#133E37] focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="rounded-full bg-[#133E37] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
      </form>
    </div>
  )
}
