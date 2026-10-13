import { useEffect, useRef, useState } from 'react'
import { ImagePlus, LocateFixed, X } from 'lucide-react'
import * as api from './api'
import { PawPrintIcon } from './Icons'
import { IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_BYTES, POST_TYPES, SPECIES, getPosition } from './lib'

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
 * registered: ubicación registrada del usuario ({lat,lng}) o null.
 * La ubicación que se anexa a la publicación puede ser la registrada, la actual (se vuelve a pedir
 * permiso al navegador: útil si estás de viaje) o ninguna.
 */
export default function PublishModal({ onClose, onPublished, registered }) {
  const [form, setForm] = useState({ content: '', type: 'found', species: '', placeName: '' })
  const [locMode, setLocMode] = useState(registered ? 'registered' : 'none') // registered | current | none
  const [current, setCurrent] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [images, setImages] = useState([]) // [{ file, preview }]
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const firstField = useRef(null)
  const imagesRef = useRef(images)

  useEffect(() => { imagesRef.current = images }, [images])

  useEffect(() => {
    firstField.current?.focus()
    const onKey = (e) => e.key === 'Escape' && !submitting && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, submitting])

  // Libera las URLs de vista previa al desmontar
  useEffect(() => () => imagesRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), [])

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((er) => ({ ...er, [k]: '' }))
  }

  function addFiles(e) {
    const picked = [...e.target.files]
    e.target.value = '' // permite volver a elegir el mismo archivo
    const next = [...images]
    let problem = ''
    for (const file of picked) {
      if (!IMAGE_TYPES.includes(file.type)) problem = 'Solo se permiten imágenes JPG, PNG o WebP.'
      else if (file.size > MAX_IMAGE_BYTES) problem = `"${file.name}" pesa más de 5 MB.`
      else if (next.length >= MAX_IMAGES) problem = `Máximo ${MAX_IMAGES} fotos.`
      else next.push({ file, preview: URL.createObjectURL(file) })
    }
    setImages(next)
    setErrors((er) => ({ ...er, images: problem }))
  }

  function removeImage(i) {
    URL.revokeObjectURL(images[i].preview)
    setImages(images.filter((_, idx) => idx !== i))
    setErrors((er) => ({ ...er, images: '' }))
  }

  async function chooseLocation(mode) {
    setErrors((er) => ({ ...er, location: '' }))
    if (mode !== 'current') return setLocMode(mode)
    // "Actual": cada vez que se elige, se pide una lectura nueva (y el navegador pide permiso si hace falta)
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

  function validate() {
    const er = {}
    const content = form.content.trim()
    if (content.length < 3) er.content = 'Escribe al menos 3 caracteres.'
    else if (content.length > 2000) er.content = 'Máximo 2000 caracteres.'
    if (form.placeName.trim().length > 120) er.placeName = 'Máximo 120 caracteres.'
    return er
  }

  async function submit(e) {
    e.preventDefault()
    const er = validate()
    setErrors(er)
    setFormError('')
    if (Object.keys(er).length) return

    const body = new FormData()
    body.append('content', form.content.trim())
    body.append('type', form.type)
    if (form.species) body.append('species', form.species)
    const coords = locMode === 'registered' ? registered : locMode === 'current' ? current : null
    if (form.placeName.trim() || coords) {
      body.append('location', JSON.stringify({
        placeName: form.placeName.trim() || undefined,
        latitude: coords?.lat,
        longitude: coords?.lng,
      }))
    }
    images.forEach((i) => body.append('images', i.file))

    setSubmitting(true)
    try {
      const { post } = await api.publish(body)
      onPublished(post)
      onClose()
    } catch (err) {
      setErrors(err.fields ?? {})
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

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
        aria-labelledby="publish-title"
        className="my-auto w-full max-w-lg rounded-3xl border border-[#BCD2C6] bg-white p-6 text-[#133E37] shadow-2xl sm:p-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="publish-title" className="flex items-center gap-2 text-xl font-bold">
            <PawPrintIcon className="h-5 w-5" /> Publicar un animalito
          </h3>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Cerrar" className="rounded-full p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Descripción" htmlFor="content" error={errors.content}>
            <textarea
              id="content"
              ref={firstField}
              value={form.content}
              onChange={set('content')}
              rows={4}
              maxLength={2000}
              placeholder="Cuéntanos cómo es, dónde lo viste y si necesita ayuda."
              aria-invalid={!!errors.content}
              className={inputCls}
            />
            <p className="mt-1 text-right text-xs text-gray-400">{form.content.length}/2000</p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo" htmlFor="type" error={errors.type}>
              <select id="type" value={form.type} onChange={set('type')} className={inputCls}>
                {Object.entries(POST_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Especie" htmlFor="species" error={errors.species}>
              <select id="species" value={form.species} onChange={set('species')} className={inputCls}>
                <option value="">Sin especificar</option>
                {Object.entries(SPECIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Ubicación del animalito" htmlFor="placeName" error={errors.placeName || errors.location}>
            <input
              id="placeName"
              value={form.placeName}
              onChange={set('placeName')}
              maxLength={120}
              placeholder="Referencia: parque central, Av. Principal #123…"
              aria-invalid={!!(errors.placeName || errors.location)}
              className={inputCls}
            />
            <div role="radiogroup" aria-label="Coordenadas de la publicación" className="mt-2 flex flex-wrap gap-2">
              {[
                { id: 'registered', label: 'Usar ubicación registrada', disabled: !registered },
                { id: 'current', label: geoLoading ? 'Obteniendo…' : 'Usar ubicación actual', disabled: false },
                { id: 'none', label: 'Sin coordenadas', disabled: false },
              ].map((o) => (
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
                  {o.id === 'current' && <LocateFixed className="h-4 w-4" />}
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {locMode === 'registered' && 'Se anexará la ubicación que registraste al iniciar sesión.'}
              {locMode === 'current' && 'Ubicación actual detectada ✓ — se anexará a la publicación.'}
              {locMode === 'none' && (registered ? 'Solo se mostrará la referencia escrita.' : 'Aún no tienes ubicación registrada.')}
              {' '}¿Estás de viaje? Elige "ubicación actual" para que vean dónde está el animalito, no dónde vives.
            </p>
          </Field>

          <Field label={`Fotos (${images.length}/${MAX_IMAGES})`} htmlFor="images" error={errors.images}>
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={img.preview} className="relative h-20 w-20 overflow-hidden rounded-xl border border-gray-200">
                  <img src={img.preview} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    aria-label={`Quitar foto ${i + 1}`}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <label
                  htmlFor="images"
                  className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#A3C2B2] text-xs text-[#133E37]/70 hover:bg-[#E9F0EC]"
                >
                  <ImagePlus className="h-5 w-5" /> Añadir
                </label>
              )}
            </div>
            <input id="images" type="file" accept={IMAGE_TYPES.join(',')} multiple onChange={addFiles} className="sr-only" />
            <p className="mt-1 text-xs text-gray-400">JPG, PNG o WebP · máx. 5 MB c/u. Se eliminan los datos de ubicación (EXIF) de la foto.</p>
          </Field>

          {formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#133E37] py-3 font-bold text-white shadow-md transition-colors hover:bg-[#0f322c] disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </form>
    </div>
  )
}
