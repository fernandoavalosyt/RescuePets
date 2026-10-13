import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Heart, HeartHandshake, Link2, MapPin, MessageCircle, Pencil, Trash2, Undo2 } from 'lucide-react'
import * as api from './api'
import Comments from './Comments'
import RescueModal from './RescueModal'
import EditPostModal from './EditPostModal'
import { useApp } from './AppContext'
import { POST_TYPES, SPECIES, distanceKm, formatDistance, osmEmbed, osmLink, postUrl, timeAgo } from './lib'

const TYPE_COLORS = {
  found: 'bg-[#133E37] text-white',
  lost: 'bg-amber-500 text-white',
  adoption: 'bg-emerald-600 text-white',
  general: 'bg-gray-500 text-white',
}

function Images({ images, alt, className = 'mt-3' }) {
  if (!images.length) return null
  const grid = images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
  return (
    <div className={`${className} grid gap-1.5 overflow-hidden rounded-2xl ${grid}`}>
      {images.map((img, i) => (
        <img
          key={img.id}
          src={img.url}
          alt={`${alt} (foto ${i + 1})`}
          width={img.width}
          height={img.height}
          loading="lazy"
          className={`w-full object-cover ${images.length === 1 ? 'max-h-96' : 'aspect-square'} ${images.length === 3 && i === 0 ? 'row-span-2 h-full' : ''}`}
        />
      ))}
    </div>
  )
}

/** Dónde está el animal: referencia, distancia a ti, coordenadas y mapa (visible aunque estés en otra ciudad). */
function LocationInfo({ location, coords }) {
  const [open, setOpen] = useState(false)
  const hasPoint = location.latitude != null
  const label = [location.placeName, location.city].filter(Boolean).join(', ')
  const km = hasPoint && coords ? distanceKm(coords, { lat: location.latitude, lng: location.longitude }) : null

  return (
    <div className="mt-1 text-sm text-[#133E37]/80">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /> {label}</span>
        {km !== null && <span className="rounded-full bg-[#E9F0EC] px-2 py-0.5 text-xs font-semibold">{formatDistance(km)}</span>}
        {hasPoint && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-xs font-semibold underline">
            {open ? 'Ocultar mapa' : 'Ver ubicación en el mapa'}
          </button>
        )}
      </p>
      {open && hasPoint && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-[#BCD2C6]">
          <iframe
            title={`Mapa: ${label}`}
            src={osmEmbed(location.latitude, location.longitude)}
            loading="lazy"
            className="h-52 w-full"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#E9F0EC] px-3 py-1.5 text-xs">
            <span>{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span>
            <a href={osmLink(location.latitude, location.longitude)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
              Abrir mapa grande <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PostCard({ post, onChange, onRemove }) {
  const { coords, notify, subscribe } = useApp()
  const [showComments, setShowComments] = useState(false)
  const [rescuing, setRescuing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  // Si llega en vivo una notificación de rescate sobre esta publicación, se vuelve a consultar su estado
  useEffect(() => subscribe((n) => {
    if (n.post?.id === post.id && n.type.startsWith('rescue_')) {
      api.getPost(post.id).then((d) => onChangeRef.current(d.post)).catch(() => {})
    }
  }), [subscribe, post.id])

  const resolved = post.status === 'resolved'
  const rescued = post.status === 'rescued'

  async function toggleLike() {
    if (busy) return
    const liked = !post.viewer.liked
    // Optimista: se actualiza al instante y se revierte si falla
    const before = post
    onChange({ ...post, viewer: { liked }, counts: { ...post.counts, likes: post.counts.likes + (liked ? 1 : -1) } })
    setBusy(true)
    try {
      const res = await (liked ? api.likePost(post.id) : api.unlikePost(post.id))
      onChange({ ...before, viewer: { liked: res.liked }, counts: { ...before.counts, likes: res.likes } })
    } catch (e) {
      onChange(before)
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleResolved() {
    try {
      const { post: updated } = await api.updatePost(post.id, { status: resolved ? 'active' : 'resolved' })
      onChange(updated)
    } catch (e) {
      setError(e.message)
    }
  }

  async function remove() {
    if (!window.confirm('¿Eliminar esta publicación?')) return
    try {
      await api.deletePost(post.id)
      onRemove(post.id)
    } catch (e) {
      setError(e.message)
    }
  }

  async function undoRescue() {
    if (!window.confirm('¿Deshacer el rescate? La publicación volverá al feed y se borrarán las fotos de verificación.')) return
    try {
      const { post: updated } = await api.undoRescue(post.id)
      onChange(updated)
      notify('Rescate deshecho: la publicación volvió al feed.')
    } catch (e) {
      setError(e.message)
    }
  }

  // El autor decide sobre la solicitud de rescate (validación anti-fraude)
  async function approve() {
    try {
      const { post: updated } = await api.approveRescue(post.id)
      onChange(updated)
      notify('Rescate aprobado: ya es un logro.', { href: '#/logros', label: 'Ver Logros' })
    } catch (e) {
      setError(e.message)
    }
  }

  async function reject(e) {
    e.preventDefault()
    try {
      const { post: updated } = await api.rejectRescue(post.id, reason.trim() || undefined)
      setRejecting(false)
      setReason('')
      onChange(updated)
      notify('Solicitud rechazada. La publicación sigue disponible.')
    } catch (err) {
      setError(err.fields?.reason || err.message)
    }
  }

  async function cancelRequest() {
    if (!window.confirm('¿Retirar tu solicitud de rescate?')) return
    try {
      const { post: updated } = await api.undoRescue(post.id)
      onChange(updated)
      notify('Solicitud retirada.')
    } catch (e) {
      setError(e.message)
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(postUrl(post.id))
      notify('Enlace copiado al portapapeles.')
    } catch {
      window.prompt('Copia el enlace de la publicación:', postUrl(post.id))
    }
  }

  return (
    <article className={`rounded-3xl border bg-white p-4 shadow-sm sm:p-5 ${rescued ? 'border-emerald-300' : 'border-[#BCD2C6]'}`}>
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <a href={`#/u/${post.author.username}`} className="font-bold hover:underline">@{post.author.username}</a>
        <a href={`#/post/${post.id}`} className="text-[#133E37]/60 hover:underline">· {timeAgo(post.createdAt)}</a>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_COLORS[post.type]}`}>
          {POST_TYPES[post.type]}
        </span>
        {post.species && <span className="rounded-full bg-[#E9F0EC] px-2.5 py-0.5 text-xs font-semibold">{SPECIES[post.species]}</span>}
        {resolved && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> Ya encontró familia
          </span>
        )}
        {rescued && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            <HeartHandshake className="h-3.5 w-3.5" /> Rescatado
          </span>
        )}
        {post.status === 'hidden' && <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold">Oculta</span>}
      </header>

      {post.location && <LocationInfo location={post.location} coords={coords} />}

      <p className="mt-2 whitespace-pre-wrap break-words">{post.content}</p>
      <Images images={post.images} alt={`Publicación de @${post.author.username}`} />

      {post.rescue && (
        <section className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm" aria-label="Rescate verificado">
          <p className="font-semibold text-emerald-900">
            <HeartHandshake className="mr-1 inline h-4 w-4" />
            Rescatado por <a href={`#/u/${post.rescue.rescuer.username}`} className="underline">@{post.rescue.rescuer.username}</a>
            <span className="font-normal text-emerald-800/70"> · {timeAgo(post.rescue.createdAt)}</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words">{post.rescue.note}</p>
          <Images images={post.rescue.images} alt={`Rescate de @${post.rescue.rescuer.username}`} className="mt-2" />
          {post.rescue.canUndo && (
            <button type="button" onClick={undoRescue} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-900 underline">
              <Undo2 className="h-3.5 w-3.5" /> Deshacer rescate
            </button>
          )}
        </section>
      )}

      {post.rescueRequest && (
        <section className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm" aria-label="Solicitud de rescate pendiente">
          <p className="font-semibold text-amber-900">
            <HeartHandshake className="mr-1 inline h-4 w-4" />
            {post.rescueRequest.canDecide
              ? <><a href={`#/u/${post.rescueRequest.rescuer.username}`} className="underline">@{post.rescueRequest.rescuer.username}</a> quiere rescatar a este animalito</>
              : post.rescueRequest.mine
                ? 'Tu solicitud de rescate espera la aprobación del autor'
                : 'Rescate en revisión: el autor debe confirmarlo'}
            <span className="font-normal text-amber-800/70"> · {timeAgo(post.rescueRequest.createdAt)}</span>
          </p>
          {post.rescueRequest.note && <p className="mt-1 whitespace-pre-wrap break-words">{post.rescueRequest.note}</p>}
          {post.rescueRequest.images && <Images images={post.rescueRequest.images} alt="Foto de verificación del rescate" className="mt-2" />}

          {post.rescueRequest.canDecide && !rejecting && (
            <>
              <p className="mt-2 text-xs text-amber-900/80">Comprueba que la foto muestre a tu animalito antes de aprobar.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={approve} className="rounded-full bg-emerald-700 px-4 py-1.5 font-semibold text-white hover:bg-emerald-800">Aprobar rescate</button>
                <button type="button" onClick={() => setRejecting(true)} className="rounded-full border border-amber-700 px-4 py-1.5 font-semibold text-amber-900 hover:bg-amber-100">Rechazar</button>
              </div>
            </>
          )}
          {post.rescueRequest.canDecide && rejecting && (
            <form onSubmit={reject} className="mt-2 space-y-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Motivo (opcional): ej. la foto no corresponde"
                aria-label="Motivo del rechazo"
                className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 focus:outline-none focus:border-amber-700"
              />
              <div className="flex gap-2">
                <button type="submit" className="rounded-full bg-amber-700 px-4 py-1.5 font-semibold text-white hover:bg-amber-800">Confirmar rechazo</button>
                <button type="button" onClick={() => { setRejecting(false); setReason('') }} className="px-3 py-1.5 font-semibold underline">Cancelar</button>
              </div>
            </form>
          )}
          {post.rescueRequest.mine && (
            <button type="button" onClick={cancelRequest} className="mt-2 text-xs font-semibold text-amber-900 underline">Retirar solicitud</button>
          )}
        </section>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={post.viewer.liked}
          aria-label={post.viewer.liked ? 'Quitar me gusta' : 'Me gusta'}
          className={`inline-flex items-center gap-1.5 font-semibold ${post.viewer.liked ? 'text-rose-600' : 'hover:text-rose-600'}`}
        >
          <Heart className={`h-5 w-5 ${post.viewer.liked ? 'fill-rose-600' : ''}`} /> {post.counts.likes}
        </button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          aria-expanded={showComments}
          className="inline-flex items-center gap-1.5 font-semibold hover:underline"
        >
          <MessageCircle className="h-5 w-5" /> {post.counts.comments}
        </button>
        <button type="button" onClick={share} aria-label="Copiar enlace de la publicación" className="inline-flex items-center gap-1 text-[#133E37]/70 hover:text-[#133E37]">
          <Link2 className="h-4 w-4" /> Compartir
        </button>

        <span className="ml-auto flex items-center gap-3">
          {!post.mine && post.status === 'active' && !post.rescueRequest && (
            <button
              type="button"
              onClick={() => setRescuing(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#133E37] px-4 py-1.5 font-semibold text-white transition-colors hover:bg-[#0f322c]"
            >
              <HeartHandshake className="h-4 w-4" /> Rescatar
            </button>
          )}
          {post.mine && ['active', 'hidden', 'resolved'].includes(post.status) && !post.rescueRequest && (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 font-semibold hover:underline">
              <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
            </button>
          )}
          {post.mine && !rescued && !post.rescueRequest && (
            <button type="button" onClick={toggleResolved} className="font-semibold hover:underline">
              {resolved ? 'Reactivar' : 'Marcar como resuelto'}
            </button>
          )}
          {post.mine && (
            <button type="button" onClick={remove} aria-label="Eliminar publicación" className="text-[#133E37]/60 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </span>
      </footer>

      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}

      {showComments && (
        <Comments
          post={post}
          onCountChange={(n) => onChange({ ...post, counts: { ...post.counts, comments: n } })}
        />
      )}

      {editing && (
        <EditPostModal post={post} registered={coords} onClose={() => setEditing(false)} onSaved={onChange} />
      )}

      {rescuing && (
        <RescueModal
          post={post}
          onClose={() => setRescuing(false)}
          onRescued={(updated) => {
            onChange(updated)
            notify('Solicitud enviada. Cuando el autor la apruebe, el rescate contará como logro.')
          }}
        />
      )}
    </article>
  )
}
