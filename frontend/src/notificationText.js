import { SPECIES } from './lib'

const TYPE_WORDS = { found: 'encontrado', lost: 'perdido', adoption: 'en adopción' }
const KM = (km) => (km < 1 ? `${Math.max(1, Math.round((km * 1000) / 10) * 10)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`)

/** Texto de una notificación a partir de su tipo, quién la causó y sus datos. -> { title, body } */
export function describeNotification(n) {
  const who = n.actor ? `@${n.actor.username}` : 'Alguien'
  const d = n.data ?? {}
  switch (n.type) {
    case 'nearby_pet': {
      const animal = (SPECIES[d.species] ?? 'animalito').toLowerCase()
      const state = TYPE_WORDS[d.postType] ?? ''
      return {
        title: `Hay un ${animal === 'otro' ? 'animalito' : animal} ${state} a ${KM(d.distanceKm)} de ti`,
        body: `Puedes rescatarlo o ayudarlo${d.placeName ? ` · ${d.placeName}` : ''}`,
      }
    }
    case 'rescue_requested':
      return { title: `${who} quiere rescatar a tu animalito`, body: 'Revisa su foto y descripción: apruébalo o recházalo.' }
    case 'rescue_approved':
      return { title: `${who} aprobó tu rescate`, body: '¡Ya es un logro! Gracias por ayudar.' }
    case 'rescue_rejected':
      return { title: `${who} rechazó tu solicitud de rescate`, body: d.reason ? `Motivo: ${d.reason}` : 'No indicó un motivo.' }
    case 'rescue_cancelled':
      return { title: `${who} retiró su solicitud de rescate`, body: 'La publicación sigue disponible.' }
    case 'rescue_undone':
      return { title: `${who} deshizo un rescate`, body: 'La publicación volvió al feed.' }
    case 'rescue_expired':
      return { title: 'Una solicitud de rescate caducó', body: 'Nadie respondió en 7 días; la publicación volvió a estar disponible.' }
    case 'comment':
      return { title: `${who} comentó tu publicación`, body: `“${d.snippet ?? ''}”` }
    case 'reply':
      return { title: `${who} respondió tu comentario`, body: `“${d.snippet ?? ''}”` }
    default:
      return { title: 'Nueva notificación', body: '' }
  }
}
