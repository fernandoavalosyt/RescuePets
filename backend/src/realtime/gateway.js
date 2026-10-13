const { WebSocketServer } = require('ws');
const { parseCookie } = require('cookie');
const { clientOrigin } = require('../config/env');
const { isAllowedOrigin } = require('../shared/http');

/*
 * Canal en tiempo real (WebSocket) para notificaciones. Servidor -> cliente únicamente.
 *  - Se conecta a /ws con la misma cookie de sesión (httpOnly) que la API REST.
 *  - Se valida el Origin del navegador y la sesión antes de aceptar la conexión.
 *  - Máx. 5 conexiones por usuario; latido cada 30 s; si la sesión expira se cierra (código 4401).
 *  - Si el cliente está desconectado no se pierde nada: las notificaciones están en la BD y se consultan por REST.
 */
const MAX_PER_USER = 5;
const HEARTBEAT_MS = 30_000;
const COOKIE_NAME = 'rp_session';

const clients = new Map(); // userId -> Set<ws>
let authenticate; // se resuelve al adjuntar, para evitar dependencias circulares entre módulos

const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
};

/** Envía un mensaje a todas las conexiones abiertas de un usuario. */
function publish(userId, payload) {
  for (const ws of clients.get(userId) ?? []) send(ws, payload);
}

const isConnected = (userId) => (clients.get(userId)?.size ?? 0) > 0;

function reject(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/** Engancha el WebSocket al servidor HTTP. Devuelve una función para cerrarlo (tests / apagado). */
function attach(server, { getInitial } = {}) {
  authenticate = require('../modules/auth/auth.service').authenticate;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on('upgrade', (req, socket, head) => {
    // Un error aquí nunca debe tumbar el servidor: se rechaza la conexión y se registra
    try {
      onUpgrade(req, socket, head);
    } catch (e) {
      console.error('[ws] error en el handshake:', e.message);
      reject(socket, 400, 'Bad Request');
    }
  });

  const onUpgrade = (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws') return reject(socket, 404, 'Not Found');
    const origin = req.headers.origin;
    if (!origin || !isAllowedOrigin(origin, req.headers.host, clientOrigin)) return reject(socket, 403, 'Forbidden');

    const token = parseCookie(req.headers.cookie ?? '')[COOKIE_NAME];
    const user = authenticate(token);
    if (!user) return reject(socket, 401, 'Unauthorized');
    if ((clients.get(user.id)?.size ?? 0) >= MAX_PER_USER) return reject(socket, 429, 'Too Many Requests');

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = user.id;
      ws.token = token;
      ws.isAlive = true;
      if (!clients.has(user.id)) clients.set(user.id, new Set());
      clients.get(user.id).add(ws);

      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('message', () => {}); // el canal es solo de salida; se ignora lo que envíe el cliente
      ws.on('error', () => ws.terminate());
      ws.on('close', () => {
        const set = clients.get(user.id);
        set?.delete(ws);
        if (set && !set.size) clients.delete(user.id);
      });

      send(ws, { type: 'ready', counts: getInitial ? getInitial(user.id) : null });
    });
  };

  const timer = setInterval(() => {
    for (const set of clients.values()) {
      for (const ws of set) {
        if (!ws.isAlive) { ws.terminate(); continue; }
        if (!authenticate(ws.token)) { ws.close(4401, 'session expired'); continue; }
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, HEARTBEAT_MS);
  timer.unref();

  return () => {
    clearInterval(timer);
    for (const set of clients.values()) for (const ws of set) ws.terminate();
    clients.clear();
    wss.close();
  };
}

module.exports = { attach, publish, isConnected };
