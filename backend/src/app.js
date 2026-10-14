const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const modules = require('./modules');
const { errorHandler } = require('./shared/errors');
const { originGuard } = require('./shared/http');

const app = express();

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// CSP: solo lo que la app usa (scripts propios, fotos propias, ejemplos de Unsplash, mapa de OpenStreetMap y WebSocket).
const csp = config.serveFrontend ? {
  useDefaults: true,
  directives: {
    'img-src': ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
    'frame-src': ['https://www.openstreetmap.org'],
    'connect-src': ["'self'", 'ws:', 'wss:'],
    'upgrade-insecure-requests': null, // lo cubre HSTS; evita romper pruebas locales por http
  },
} : undefined;
// Las imágenes también se consumen desde otro origen cuando el frontend va aparte, por eso CORP = cross-origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: csp }));

// Imágenes: nombres aleatorios e inmutables -> caché larga.
app.use('/uploads', express.static(config.uploadRoot, {
  index: false,
  dotfiles: 'deny',
  immutable: true,
  maxAge: '30d',
  extensions: false,
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use('/api', originGuard(config.clientOrigin));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

// Diagnóstico de despliegue: "served" (todo bien) | "disabled" (falta SERVE_FRONTEND=true) | "missing" (no existe frontend/dist)
const frontendIndex = path.join(config.frontendDist, 'index.html');
const frontendState = !config.serveFrontend ? 'disabled' : fs.existsSync(frontendIndex) ? 'served' : 'missing';
if (frontendState === 'disabled') console.log('[web] Frontend desactivado (define SERVE_FRONTEND=true para servirlo desde este servidor).');
if (frontendState === 'served') console.log(`[web] Sirviendo el frontend desde ${config.frontendDist}`);
// En producción los datos solo sobreviven a un redespliegue si DATA_DIR/UPLOAD_DIR apuntan a un volumen
const persistent = !config.isProd || (!!process.env.DATA_DIR && !!process.env.UPLOAD_DIR);
if (!persistent) console.warn('[data] ATENCIÓN: sin DATA_DIR y UPLOAD_DIR la base de datos y las fotos se BORRAN en cada despliegue (monta un volumen y define ambas variables).');
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running correctly', frontend: frontendState, storage: persistent ? 'persistent' : 'EPHEMERAL' });
});

app.use('/api', modules);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Frontend compilado (React/Vite) servido por este mismo servidor
if (config.serveFrontend) {
  const index = frontendIndex;
  if (frontendState === 'missing') {
    console.warn(`[web] SERVE_FRONTEND=true pero no existe ${index}: el build del frontend no se ejecutó (revisa el Build Command / Root Directory).`);
  } else {
    // /assets/* tiene nombres con hash: caché larga. index.html nunca se cachea (así llegan las versiones nuevas).
    app.use(express.static(config.frontendDist, {
      index: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (path.basename(file) === 'sw.js') res.setHeader('Cache-Control', 'no-cache'); // el service worker debe actualizarse siempre
      },
    }));
    app.get(/^\/(?!api\/|uploads\/|ws$).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(index);
    });
  }
}

app.use(errorHandler);

module.exports = app;
