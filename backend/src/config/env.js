const path = require('path');
require('dotenv').config({ quiet: true });

const port = Number(process.env.PORT) || 5000;
const root = path.join(__dirname, '..', '..');
// Un solo servicio: el backend sirve también el frontend compilado (mismo origen: sin CORS ni cookies entre dominios)
const serveFrontend = process.env.SERVE_FRONTEND === 'true';

module.exports = {
  port,
  isProd: process.env.NODE_ENV === 'production',
  serveFrontend,
  frontendDist: process.env.FRONTEND_DIST || path.join(root, '..', 'frontend', 'dist'),
  // Detrás del proxy de Railway/Render hay que confiar en X-Forwarded-* (IP real, https). 0 = no confiar.
  trustProxy: process.env.TRUST_PROXY === undefined ? 0 : (Number.isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY)),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Prefijo de las URLs de imágenes. Vacío (rutas relativas) cuando el frontend se sirve desde el mismo servidor.
  publicUrl: (process.env.PUBLIC_URL || (serveFrontend ? '' : `http://localhost:${port}`)).replace(/\/$/, ''),
  // En un host con volumen persistente, apunta ambos a ese volumen (p. ej. /data/db y /data/uploads)
  dataDir: process.env.DATA_DIR || path.join(root, 'data'),
  uploadRoot: process.env.UPLOAD_DIR || path.join(root, 'uploads'),

  // Exportación de métricas a Google Sheets (Google Apps Script Web App). La API key SOLO va en .env.
  googleSheets: {
    webhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
    apiKey: process.env.GOOGLE_SHEETS_API_KEY || '',
    keyParam: process.env.GOOGLE_SHEETS_KEY_PARAM || 'api_key',          // nombre del campo que lee tu script
    keyIn: process.env.GOOGLE_SHEETS_KEY_IN === 'query' ? 'query' : 'body', // dónde viaja la key
    intervalMin: Number(process.env.GOOGLE_SHEETS_EXPORT_INTERVAL_MIN) || 0, // 0 = sin envío automático
  },
};
