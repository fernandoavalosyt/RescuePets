// Texto de la notificación push (misma redacción que frontend/src/notificationText.js).
const SPECIES = { dog: 'perro', cat: 'gato', other: 'animalito' };
const TYPE_WORDS = { found: 'encontrado', lost: 'perdido', adoption: 'en adopción' };
const km = (v) => (v < 1 ? `${Math.max(1, Math.round((v * 1000) / 10) * 10)} m` : `${v < 10 ? v.toFixed(1) : Math.round(v)} km`);
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

function describe(n) {
  const who = n.actor ? `@${n.actor.username}` : 'Alguien';
  const d = n.data ?? {};
  switch (n.type) {
    case 'nearby_pet':
      return {
        title: `Hay un ${SPECIES[d.species] ?? 'animalito'} ${TYPE_WORDS[d.postType] ?? ''} a ${km(d.distanceKm ?? 0)} de ti`.replace(/\s+/g, ' '),
        body: `Puedes rescatarlo o ayudarlo${d.placeName ? ` · ${clip(d.placeName, 60)}` : ''}`,
      };
    case 'rescue_requested': return { title: `${who} quiere rescatar a tu animalito`, body: 'Revisa su foto y descripción: apruébalo o recházalo.' };
    case 'rescue_approved': return { title: `${who} aprobó tu rescate`, body: '¡Ya es un logro! Gracias por ayudar.' };
    case 'rescue_rejected': return { title: `${who} rechazó tu solicitud de rescate`, body: d.reason ? `Motivo: ${clip(d.reason, 100)}` : 'No indicó un motivo.' };
    case 'rescue_cancelled': return { title: `${who} retiró su solicitud de rescate`, body: 'La publicación sigue disponible.' };
    case 'rescue_undone': return { title: `${who} deshizo un rescate`, body: 'La publicación volvió al feed.' };
    case 'rescue_expired': return { title: 'Una solicitud de rescate caducó', body: 'Nadie respondió en 7 días; la publicación volvió a estar disponible.' };
    case 'comment': return { title: `${who} comentó tu publicación`, body: `“${clip(d.snippet, 100)}”` };
    case 'reply': return { title: `${who} respondió tu comentario`, body: `“${clip(d.snippet, 100)}”` };
    default: return { title: 'Nueva notificación', body: '' };
  }
}

module.exports = { describe };
