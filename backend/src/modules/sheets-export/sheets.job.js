const service = require('./sheets.service');
const config = require('../../config/env');

/** Ejecuta una exportación y la deja registrada (sin datos sensibles). Nunca lanza. */
async function runOnce() {
  try {
    const r = await service.exportMetrics();
    if (r.ok) console.log('[sheets] métricas exportadas:', JSON.stringify(r.payload));
    else console.error(`[sheets] la exportación falló (HTTP ${r.status}): ${r.error}`);
    return r;
  } catch (e) {
    console.error('[sheets]', e.message);
    return { ok: false, error: e.message };
  }
}

/** Envío automático cada GOOGLE_SHEETS_EXPORT_INTERVAL_MIN minutos (0 = desactivado; también existe el comando manual). */
function start() {
  const { intervalMin } = config.googleSheets;
  if (!intervalMin) return;
  if (!service.isConfigured()) {
    console.warn('[sheets] GOOGLE_SHEETS_EXPORT_INTERVAL_MIN está activo pero falta GOOGLE_SHEETS_WEBHOOK_URL o GOOGLE_SHEETS_API_KEY: exportación desactivada.');
    return;
  }
  setTimeout(runOnce, 30_000).unref();
  setInterval(runOnce, intervalMin * 60 * 1000).unref();
  console.log(`[sheets] exportación automática cada ${intervalMin} min`);
}

module.exports = { start, runOnce };
