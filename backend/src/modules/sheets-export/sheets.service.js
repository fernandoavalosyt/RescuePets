const db = require('../../database/connection');
const config = require('../../config/env');

/*
 * Exportación de métricas a Google Sheets mediante una Web App de Google Apps Script.
 * (Adaptación a Node del script Python original: misma carga útil JSON y mismo método POST.)
 *
 * Carga útil — idéntica a la del script original:
 *   { fecha_exportacion, total_usuarios, total_publicaciones, publicaciones_hoy }
 * + la API key (por defecto en el cuerpo, campo "api_key"; configurable en .env).
 * En Apps Script se lee con:  const data = JSON.parse(e.postData.contents);  data.api_key
 */

const ALLOWED_HOSTS = ['script.google.com', 'script.googleusercontent.com'];
const TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1000, 3000]; // 3 intentos en total ante fallos de red o 5xx

class SheetsError extends Error {}

const pad = (n) => String(n).padStart(2, '0');
const formatLocal = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const isConfigured = (cfg = config.googleSheets) => !!(cfg.webhookUrl && cfg.apiKey);

/** Lee las métricas de la BD (las publicaciones borradas no cuentan). */
function buildMetrics(now = new Date()) {
  const one = (sql) => db.prepare(sql).get().n;
  return {
    fecha_exportacion: formatLocal(now),
    total_usuarios: one('SELECT COUNT(*) AS n FROM users'),
    total_publicaciones: one("SELECT COUNT(*) AS n FROM posts WHERE status != 'deleted'"),
    publicaciones_hoy: one(`SELECT COUNT(*) AS n FROM posts
                            WHERE status != 'deleted'
                              AND date(created_at / 1000, 'unixepoch', 'localtime') = date('now', 'localtime')`),
  };
}

function validateUrl(raw, allowInsecure) {
  let url;
  try { url = new URL(raw); } catch { throw new SheetsError('GOOGLE_SHEETS_WEBHOOK_URL no es una URL válida.'); }
  if (!allowInsecure) {
    if (url.protocol !== 'https:') throw new SheetsError('GOOGLE_SHEETS_WEBHOOK_URL debe usar https.');
    if (!ALLOWED_HOSTS.includes(url.hostname)) throw new SheetsError('GOOGLE_SHEETS_WEBHOOK_URL debe ser una Web App de script.google.com.');
  }
  return url;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Interpreta la respuesta de Apps Script (JSON). Una página HTML suele indicar que la Web App no es pública. */
function parseResponse(status, text) {
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (body === null) {
    return { ok: false, status, error: 'La respuesta no es JSON (¿la Web App está publicada con acceso "Cualquier persona"?).' };
  }
  const failed = body.error || body.success === false || body.status === 'error' || body.result === 'error';
  return { ok: status >= 200 && status < 300 && !failed, status, body, ...(failed && { error: String(body.error ?? body.message ?? 'El script devolvió un error.') }) };
}

/**
 * Envía una carga útil al webhook. La API key nunca se registra ni se devuelve.
 * opts.allowInsecure: solo para pruebas con un servidor local.
 */
async function send(payload, cfg = config.googleSheets, opts = {}) {
  if (!isConfigured(cfg)) throw new SheetsError('Falta GOOGLE_SHEETS_WEBHOOK_URL o GOOGLE_SHEETS_API_KEY en el .env.');
  const url = validateUrl(cfg.webhookUrl, opts.allowInsecure);

  let body = payload;
  if (cfg.keyIn === 'query') url.searchParams.set(cfg.keyParam, cfg.apiKey);
  else body = { ...payload, [cfg.keyParam]: cfg.apiKey };

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'follow', // Apps Script responde con una redirección 302 a googleusercontent
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const result = parseResponse(res.status, await res.text());
      if (res.status < 500) return result; // 2xx/4xx: respuesta definitiva
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e.name === 'TimeoutError' ? 'tiempo de espera agotado' : `error de red (${e.cause?.code ?? e.message})`;
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(opts.retryDelayMs ?? RETRY_DELAYS_MS[attempt]);
  }
  return { ok: false, status: 0, error: `No se pudo contactar a Google Sheets: ${lastError}.` };
}

/** Lee las métricas y las envía. Devuelve { ok, status, payload, body|error } (payload sin la key). */
async function exportMetrics(cfg = config.googleSheets, opts = {}) {
  const payload = buildMetrics();
  const result = await send(payload, cfg, opts);
  return { ...result, payload };
}

module.exports = { exportMetrics, buildMetrics, send, isConfigured, SheetsError };
