// Sonido característico de RescuePets: un "ding-ding-dong" suave y ascendente (sintetizado, sin archivos).
const KEY = 'rp_sound'
let ctx = null

export const soundEnabled = () => {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}
export const setSoundEnabled = (on) => {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* sin almacenamiento */ }
}

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx ??= new AC()
  return ctx
}

// Los navegadores solo permiten audio tras un gesto del usuario: se "desbloquea" en el primer toque.
export function unlockSound() {
  const unlock = () => { audio()?.resume?.().catch(() => {}) }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}

/** Reproduce el sonido (si el usuario no lo silenció). `force` ignora la preferencia (botón de prueba). */
export function playNotificationSound(force = false) {
  if (!force && !soundEnabled()) return
  const ac = audio()
  if (!ac || ac.state === 'closed') return
  ac.resume?.().catch(() => {})
  if (ac.state !== 'running') return // aún bloqueado por el navegador

  // Mi5 · Sol5 · Do6 (arpegio de Do mayor): campanita cálida con un armónico suave
  const notes = [659.25, 783.99, 1046.5]
  const t0 = ac.currentTime + 0.02
  notes.forEach((freq, i) => {
    const t = t0 + i * 0.13
    const last = i === notes.length - 1
    const dur = last ? 0.55 : 0.2
    for (const [mult, vol, type] of [[1, 0.22, 'sine'], [2, 0.06, 'triangle']]) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = type
      osc.frequency.value = freq * mult
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.connect(gain).connect(ac.destination)
      osc.start(t)
      osc.stop(t + dur + 0.05)
    }
  })
}
