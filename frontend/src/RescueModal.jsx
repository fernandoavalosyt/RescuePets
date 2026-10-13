import { useEffect, useRef, useState } from 'react'
import { ImagePlus, MapPin, X } from 'lucide-react'
import * as api from './api'
import { PawPrintIcon } from './Icons'
import { useImagePicker } from './useImagePicker'
import { IMAGE_TYPES, MAX_RESCUE_IMAGES } from './lib'

/**
 * Verificación de rescate: se comparan las fotos de la publicación con la foto del rescatista,
 * se describe cómo fue y se confirma. La publicación pasa a "Rescatado" y entra en Logros.
 */
export default function RescueModal({ post, onClose, onRescued }) {
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const picker = useImagePicker(MAX_RESCUE_IMAGES)
  const first = useRef(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e) => e.key === 'Escape' && !submitting && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, submitting])

  function validate() {
    const er = {}
    if (note.trim().length < 10) er.note = 'Describe el rescate (mínimo 10 caracteres).'
    if (!picker.images.length) er.images = 'Sube al menos una foto del animal contigo.'
    if (!confirm) er.confirm = 'Debes confirmar que es el animal de la publicación.'
    return er
  }

  async function submit(e) {
    e.preventDefault()
    const er = validate()
    setErrors(er)
    setFormError('')
    if (Object.keys(er).length) return

    const body = new FormData()
    body.append('note', note.trim())
    body.append('confirm', 'true')
    picker.images.forEach((i) => body.append('images', i.file))

    setSubmitting(true)
    try {
      const { post: updated } = await api.rescuePost(post.id, body)
      onRescued(updated)
      onClose()
    } catch (err) {
      setErrors(err.fields ?? {})
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const where = post.location && [post.location.placeName, post.location.city].filter(Boolean).join(', ')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <form
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="rescue-title"
        className="my-auto w-full max-w-lg rounded-3xl border border-[#BCD2C6] bg-white p-6 text-[#133E37] shadow-2xl sm:p-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="rescue-title" className="flex items-center gap-2 text-xl font-bold">
            <PawPrintIcon className="h-5 w-5" /> Solicitar rescate
          </h3>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Cerrar" className="rounded-full p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* El animal de la publicación, para compararlo */}
        <div className="mb-4 flex gap-3 rounded-2xl bg-[#E9F0EC] p-3">
          {post.images[0] && <img src={post.images[0].url} alt="Foto de la publicación" className="h-20 w-20 shrink-0 rounded-xl object-cover" />}
          <div className="min-w-0 text-sm">
            <p className="font-semibold">Publicación de @{post.author.username}</p>
            <p className="line-clamp-2 break-words">{post.content}</p>
            {where && <p className="mt-0.5 flex items-center gap-1 text-xs opacity-70"><MapPin className="h-3 w-3" /> {where}</p>}
          </div>
        </div>
        <p className="mb-4 text-sm text-[#133E37]/70">
          Para confirmar que es el mismo animalito, sube una foto tuya con él y cuéntanos cómo fue. Al enviarlo, el
          <strong> autor de la publicación recibirá un aviso para aprobarlo</strong>. Cuando lo apruebe, pasará a <strong>Rescatado</strong> y aparecerá en <strong>Logros</strong>.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="rescue-note" className="mb-1 block text-xs font-bold uppercase tracking-wider">Cuéntanos del rescate</label>
            <textarea
              id="rescue-note"
              ref={first}
              value={note}
              onChange={(e) => { setNote(e.target.value); setErrors((er) => ({ ...er, note: '' })) }}
              rows={4}
              maxLength={1000}
              placeholder="Ej. Lo encontré en el parque, tiene collar azul. Ya está en casa y lo llevaré al veterinario."
              aria-invalid={!!errors.note}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#133E37] focus:outline-none aria-invalid:border-red-500"
            />
            {errors.note && <p className="mt-1 text-xs text-red-600" role="alert">{errors.note}</p>}
          </div>

          <div>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider">Foto de verificación ({picker.images.length}/{MAX_RESCUE_IMAGES})</span>
            <div className="flex flex-wrap gap-2">
              {picker.images.map((img, i) => (
                <div key={img.preview} className="relative h-20 w-20 overflow-hidden rounded-xl border border-gray-200">
                  <img src={img.preview} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => picker.remove(i)} aria-label={`Quitar foto ${i + 1}`} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {picker.images.length < MAX_RESCUE_IMAGES && (
                <label htmlFor="rescue-images" className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#A3C2B2] text-xs text-[#133E37]/70 hover:bg-[#E9F0EC]">
                  <ImagePlus className="h-5 w-5" /> Añadir
                </label>
              )}
            </div>
            <input id="rescue-images" type="file" accept={IMAGE_TYPES.join(',')} multiple onChange={picker.add} className="sr-only" />
            {(picker.error || errors.images) && <p className="mt-1 text-xs text-red-600" role="alert">{picker.error || errors.images}</p>}
          </div>

          <div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => { setConfirm(e.target.checked); setErrors((er) => ({ ...er, confirm: '' })) }}
                className="mt-1 h-4 w-4 accent-[#133E37]"
              />
              <span>Confirmo que este es el animalito de la publicación y que lo rescaté.</span>
            </label>
            {errors.confirm && <p className="mt-1 text-xs text-red-600" role="alert">{errors.confirm}</p>}
          </div>

          {formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#133E37] py-3 font-bold text-white shadow-md transition-colors hover:bg-[#0f322c] disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Enviando…' : 'Enviar solicitud de rescate'}
          </button>
        </div>
      </form>
    </div>
  )
}
