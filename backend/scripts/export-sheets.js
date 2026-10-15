// Exportación manual a Google Sheets:  npm run export:sheets
// (equivale a ejecutar el script Python original). Requiere GOOGLE_SHEETS_WEBHOOK_URL en .env (GOOGLE_SHEETS_API_KEY es opcional)
const { service } = require('../src/modules/sheets-export');

(async () => {
  try {
    const r = await service.exportMetrics();
    console.log('Datos enviados:', r.payload);
    if (r.ok) {
      console.log('Respuesta de Google Sheets:', r.body);
      process.exit(0);
    }
    console.error(`Error (HTTP ${r.status}): ${r.error}`);
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(1);
})();
