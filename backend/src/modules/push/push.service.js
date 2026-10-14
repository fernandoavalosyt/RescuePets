const webpush = require('web-push');
const repo = require('./push.repository');
const config = require('../../config/env');
const { AppError } = require('../../shared/errors');
const { describe } = require('./push.text');

const MAX_PER_USER = 8;
const { publicKey, privateKey, subject } = config.push;
let active = Boolean(publicKey && privateKey);
if (active) {
  try { webpush.setVapidDetails(subject, publicKey, privateKey); } catch (e) {
    console.error('[push] claves VAPID no válidas, push desactivado:', e.message);
    active = false;
  }
} else {
  console.log('[push] Desactivado (define VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY para enviar notificaciones al dispositivo).');
}

// Solo se envía a los servicios push de los navegadores (evita que alguien registre una URL interna: SSRF).
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];
function validEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}
const b64url = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && /^[A-Za-z0-9_-]+={0,2}$/.test(s);

const getConfig = () => ({ enabled: active, publicKey: active ? publicKey : null });

function subscribe(userId, body, userAgent) {
  if (!active) throw new AppError(503, 'Las notificaciones push no están activadas en el servidor.');
  const sub = body.subscription ?? body;
  const keys = sub?.keys ?? {};
  if (!validEndpoint(sub?.endpoint) || !b64url(keys.p256dh, 200) || !b64url(keys.auth, 100)) {
    throw new AppError(400, 'Suscripción no válida.');
  }
  repo.upsert({ userId, endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: String(userAgent || '').slice(0, 200) }, Date.now());
  repo.trim(userId, MAX_PER_USER);
  return { subscribed: true };
}

function unsubscribe(userId, endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) throw new AppError(400, 'Suscripción no válida.');
  repo.removeByEndpoint(endpoint, userId);
  return { subscribed: false };
}

/**
 * Envía una notificación (ya convertida a DTO) a todos los dispositivos del usuario.
 * Nunca lanza ni bloquea: se ejecuta en segundo plano y limpia las suscripciones caducadas (404/410).
 */
function notifyUser(userId, n, unread) {
  if (!active) return;
  const subs = repo.listByUser(userId);
  if (!subs.length) return;
  const { title, body } = describe(n);
  const payload = JSON.stringify({
    title, body,
    url: n.post ? `/#/post/${n.post.id}` : '/',
    tag: `rp-${n.id}`,
    unread: unread ?? undefined,
    image: n.post?.thumbnail ?? undefined,
  });
  for (const s of subs) {
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'high' })
      .catch((e) => {
        if (e.statusCode === 404 || e.statusCode === 410) repo.removeByEndpoint(s.endpoint);
        else console.error('[push] envío falló:', e.statusCode || e.message);
      });
  }
}

module.exports = { getConfig, subscribe, unsubscribe, notifyUser };
