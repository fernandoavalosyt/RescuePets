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
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api', modules);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Frontend compilado (React/Vite) servido por este mismo servidor
if (config.serveFrontend) {
  const index = path.join(config.frontendDist, 'index.html');
  if (!fs.existsSync(index)) {
    console.warn(`[web] SERVE_FRONTEND=true pero no existe ${index}: ejecuta "npm run build".`);
  } else {
    // /assets/* tiene nombres con hash: caché larga. index.html nunca se cachea (así llegan las versiones nuevas).
    app.use(express.static(config.frontendDist, {
      index: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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
