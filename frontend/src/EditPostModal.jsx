import { useEffect, useRef, useState } from 'react'
import { ImagePlus, LocateFixed, X } from 'lucide-react'
import * as api from './api'
import { PawPrintIcon } from './Icons'
import { useImagePicker } from './useImagePicker'
import { IMAGE_TYPES, MAX_IMAGES, POST_TYPES, SPECIES, getPosition } from './lib'

const inputCls =
  'w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#133E37] focus:outline-none aria-invalid:border-red-500'

function Field({ label, htmlFor, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-bold uppercase tracking-wider">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  )
}

/**
 * Edita una publicación propia: texto, tipo, especie, ubicación (mantener / registrada / actual / quitar) y fotos
 * (quitar las existentes y añadir nuevas, hasta 4 en total). onSaved(post) recibe la publicación actualizada.
 */
export default function EditPostModal({ post, registered, onClose, onSaved }) {
  const loc = post.location
  const [form, setForm] = useState({
    content: post.content,
    type: post.type,
    species: post.species ?? '',
    placeName: loc?.placeName ?? '',
  })
  const [locMode, setLocMode] = useState(loc ? 'keep' : 'none') // keep | registered | current | remove | none
  const [current, setCurrent] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [removed, setRemoved] = useState([]) // ids de fotos existentes a quitar
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const first = useRef(null)

  const kept = post.images.filter((i) => !removed.includes(i.id))
  const picker = useImagePicker(Math.max(MAX_IMAGES - kept.length, 0))

  useEffect(() => {
    first.current?.focus()
    const onKey = (e) => e.key === 'Escape' && !saving && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, saving])

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((er) => ({ ...er, [k]: '' })) }

  async function chooseLocation(mode) {
    setErrors((er) => ({ ...er, location: '' }))
    if (mode !== 'current') return setLocMode(mode)
    setGeoLoading(true)
    try {
      setCurrent(await getPosition({ fresh: true }))
      setLocMode('current')
    } catch (err) {
      setErrors((er) => ({ ...er, location: err.message }))
    } finally {
      setGeoLoading(false)
    }
  }

  /** Solo se envía lo que cambió. */
  function buildPatch() {
    const patch = {}
    const content = form.content.trim()
    if (content !== post.content) patch.content = content
    if (form.type !== post.type) patch.type = form.type
    if (form.species !== (post.species ?? '')) patch.species = form.species || null

    const placeName = form.placeName.trim()
    if (locMode === 'remove') patch.location = null
    else if (locMode === 'registered' || locMode === 'current') {
      const c = locMode === 'registered' ? registered : current
      patch.location = { placeName: placeName || undefined, address: loc?.address, city: loc?.city, country: loc?.country, latitude: c.lat, longitude: c.lng }
    } else if (locMode === 'keep' && placeName !== (loc?.placeName ?? '')) {
      patch.location = { placeName: placeName || undefined, address: loc.address, city: loc.city, country: loc.country, latitude: loc.latitude ?? undefined, longitude: loc.longitude ?? undefined }
    } else if (locMode === 'none' && placeName) {
      patch.location = { placeName }
    }
    return patch
  }

  async function submit(e) {
    e.preventDefault()
    const er = {}
    const content = form.content.trim()
    if (content.length < 3) er.content = 'Escribe al menos 3 caracteres.'
    else if (content.length > 2000) er.content = 'Máximo 2000 caracteres.'
    if (form.placeName.trim().length > 120) er.placeName = 'Máximo 120 caracteres.'
    setErrors(er)
    setFormError('')
    if (Object.keys(er).length) return

    const patch = buildPatch()
    if (!Object.keys(patch).length && !removed.length && !picker.images.length) {
      setFormError('No hay cambios que guardar.')
      return
    }

    setSaving(true)
    let latest = null
    try {
      if (Object.keys(patch).length) latest = (await api.updatePost(post.id, patch)).post
      for (const id of removed) latest = (await api.removePostImage(post.id, id)).post
      if (picker.images.length) {
        const body = new FormData()
        picker.images.forEach((i) => body.append('images', i.file))
        latest = (await api.addPostImages(post.id, body)).post
      }
      onSaved(latest)
      onClose()
    } catch (err) {
      setErrors(err.fields ?? {})
      setFormError(err.message)
      if (latest) onSaved(latest) // lo que sí se guardó antes del error ya se refleja en la tarjeta
    } finally {
      setSaving(false)
    }
  }

  const modes = [
    ...(loc ? [{ id: 'keep', label: 'Mantener ubicación' }] : [{ id: 'none', label: 'Sin coordenadas' }]),
    { id: 'registered', label: 'Usar ubicación registrada', disabled: !registered },
    { id: 'current', label: geoLoading ? 'Obteniendo…' : 'Usar ubicación actual', icon: true },
    ...(loc ? [{ id: 'remove', label: 'Quitar ubicación' }] : []),
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <form
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        className="my-auto w-full max-w-lg rounded-3xl border border-[#BCD2C6] bg-white p-6 text-[#133E37] shadow-2xl sm:p-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="edit-title" className="flex items-center gap-2 text-xl font-bold"><PawPrintIcon className="h-5 w-5" /> Editar publicación</h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" className="rounded-full p-1 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <Field label="Descripción" htmlFor="edit-content" error={errors.content}>
            <textarea id="edit-content" ref={first} value={form.content} onChange={set('content')} rows={4} maxLength={2000} aria-invalid={!!errors.content} className={inputCls} />
            <p className="mt-1 text-right text-xs text-gray-400">{form.content.length}/2000</p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo" htmlFor="edit-type" error={errors.type}>
              <select id="edit-type" value={form.type} onChange={set('type')} className={inputCls}>
                {Object.entries(POST_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Especie" htmlFor="edit-species" error={errors.species}>
              <select id="edit-species" value={form.species} onChange={set('species')} className={inputCls}>
                <option value="">Sin especificar</option>
                {Object.entries(SPECIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Ubicación del animalito" htmlFor="edit-place" error={errors.placeName || errors.location}>
            <input id="edit-place" value={form.placeName} onChange={set('placeName')} maxLength={120} placeholder="Referencia: parque central, Av. Principal #123…" aria-invalid={!!(errors.placeName || errors.location)} disabled={locMode === 'remove'} className={`${inputCls} disabled:opacity-50`} />
            <div role="radiogroup" aria-label="Coordenadas de la publicación" className="mt-2 flex flex-wrap gap-2">
              {modes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={locMode === o.id}
                  disabled={o.disabled || geoLoading}
                  onClick={() => chooseLocation(o.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    locMode === o.id ? 'border-[#133E37] bg-[#133E37] text-white' : 'border-[#BCD2C6] hover:bg-[#E9F0EC]'
                  }`}
                >
                  {o.icon && <LocateFixed className="h-4 w-4" />}
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Fotos (${kept.length + picker.images.length}/${MAX_IMAGES})`} htmlFor="edit-images" error={picker.error || errors.images}>
            <div className="flex flex-wrap gap-2">
              {post.images.map((img) => {
                const gone = removed.includes(img.id)
                return (
                  <div key={img.id} className={`relative h-20 w-20 overflow-hidden rounded-xl border border-gray-200 ${gone ? 'opacity-40' : ''}`}>
                    <img src={img.url} alt="Foto actual" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setRemoved((r) => (gone ? r.filter((x) => x !== img.id) : [...r, img.id]))}
                      aria-label={gone ? 'Conservar foto' : 'Quitar foto'}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs font-bold text-white"
                    >
                      {gone ? '↺' : '✕'}
                    </button>
                  </div>
                )
              })}
              {picker.images.map((img, i) => (
                <div key={img.preview} className="relative h-20 w-20 overflow-hidden rounded-xl border-2 border-[#A3C2B2]">
                  <img src={img.preview} alt={`Foto nueva ${i + 1}`} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => picker.remove(i)} aria-label={`Quitar foto nueva ${i + 1}`} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {kept.length + picker.images.length < MAX_IMAGES && (
                <label htmlFor="edit-images" className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#A3C2B2] text-xs text-[#133E37]/70 hover:bg-[#E9F0EC]">
                  <ImagePlus className="h-5 w-5" /> Añadir
                </label>
              )}
            </div>
            <input id="edit-images" type="file" accept={IMAGE_TYPES.join(',')} multiple onChange={picker.add} className="sr-only" />
          </Field>

          {formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{formError}</p>}

          <button type="submit" disabled={saving} className="w-full rounded-xl bg-[#133E37] py-3 font-bold text-white shadow-md transition-colors hover:bg-[#0f322c] disabled:cursor-wait disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
