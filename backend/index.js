const http = require('http');
const { port } = require('./src/config/env');
const app = require('./src/app');
const gateway = require('./src/realtime/gateway');
const notifications = require('./src/modules/notifications');
const cleanup = require('./src/jobs/cleanup');
const sheets = require('./src/modules/sheets-export');

const server = http.createServer(app);
// Canal en tiempo real para notificaciones (ws://.../ws). Al conectar informa los contadores actuales.
gateway.attach(server, { getInitial: (userId) => notifications.service.counts(userId) });

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  cleanup.start();
  sheets.job.start();
});
