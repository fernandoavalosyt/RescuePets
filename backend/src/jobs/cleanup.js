const fs = require('fs/promises');
const path = require('path');
const { uploadRoot } = require('../config/env');
const posts = require('../modules/posts');
const media = require('../modules/media');
const rescues = require('../modules/rescues');
const notifications = require('../modules/notifications');

const DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = Number(process.env.DELETED_RETENTION_DAYS) || 30;

/**
 * Elimina definitivamente las publicaciones borradas hace más de `olderThanMs`
 * (fila + imágenes + comentarios + reacciones + ubicación) y borra sus archivos.
 */
async function purgeDeletedPosts(olderThanMs = RETENTION_DAYS * DAY) {
  const cutoff = Date.now() - olderThanMs;
  let total = 0;
  for (;;) {
    const batch = posts.repository.findPurgeable(cutoff, 100);
    if (!batch.length) break;
    const urls = posts.repository.purge(batch); // BD primero; si falla un archivo queda huérfano (lo recoge purgeOrphanFiles)
    await media.removeFiles(urls);
    total += batch.length;
  }
  return total;
}

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** Borra archivos de uploads/ que ninguna fila de post_media referencia (p. ej. caída entre guardar archivo y BD). */
async function purgeOrphanFiles(minAgeMs = DAY) {
  let removed = 0;
  for await (const file of walk(uploadRoot)) {
    const rel = path.relative(uploadRoot, file).split(path.sep).join('/');
    const { mtimeMs } = await fs.stat(file);
    if (Date.now() - mtimeMs < minAgeMs) continue; // margen para subidas en curso
    if (!posts.repository.mediaUrlExists(`/uploads/${rel}`)) {
      await fs.unlink(file).catch(() => {});
      removed++;
    }
  }
  return removed;
}

async function expireRescueRequests() {
  return rescues.service.expirePending();
}

async function purgeOldNotifications() {
  return notifications.service.purgeOld();
}

async function runSafely(name, fn) {
  try {
    const n = await fn();
    if (n) console.log(`[cleanup] ${name}: ${n}`);
  } catch (e) {
    console.error(`[cleanup] ${name} falló:`, e);
  }
}

// Publicaciones borradas: cada hora. Archivos huérfanos: cada día. Primera pasada al minuto de arrancar.
function start() {
  const hourly = async () => {
    await runSafely('publicaciones purgadas', purgeDeletedPosts);
    await runSafely('solicitudes de rescate caducadas', expireRescueRequests);
    await runSafely('notificaciones antiguas', purgeOldNotifications);
  };
  const daily = () => runSafely('archivos huérfanos', purgeOrphanFiles);
  setTimeout(() => { hourly(); daily(); }, 60 * 1000).unref();
  setInterval(hourly, 60 * 60 * 1000).unref();
  setInterval(daily, DAY).unref();
}

module.exports = { start, purgeDeletedPosts, purgeOrphanFiles, expireRescueRequests, purgeOldNotifications };
