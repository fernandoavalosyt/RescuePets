import { useEffect, useRef, useState } from 'react'
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from './lib'

/** Selección de fotos con vista previa y validación de tipo/tamaño/cantidad (libera las URLs al desmontar). */
export function useImagePicker(max) {
  const [images, setImages] = useState([]) // [{ file, preview }]
  const [error, setError] = useState('')
  const ref = useRef(images)
  useEffect(() => { ref.current = images }, [images])
  useEffect(() => () => ref.current.forEach((i) => URL.revokeObjectURL(i.preview)), [])

  function add(e) {
    const picked = [...e.target.files]
    e.target.value = '' // permite volver a elegir el mismo archivo
    const next = [...images]
    let problem = ''
    for (const file of picked) {
      if (!IMAGE_TYPES.includes(file.type)) problem = 'Solo se permiten imágenes JPG, PNG o WebP.'
      else if (file.size > MAX_IMAGE_BYTES) problem = `"${file.name}" pesa más de 5 MB.`
      else if (next.length >= max) problem = `Máximo ${max} fotos.`
      else next.push({ file, preview: URL.createObjectURL(file) })
    }
    setImages(next)
    setError(problem)
  }

  function remove(i) {
    URL.revokeObjectURL(images[i].preview)
    setImages(images.filter((_, idx) => idx !== i))
    setError('')
  }

  return { images, error, setError, add, remove }
}
