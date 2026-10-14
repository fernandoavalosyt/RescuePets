# Despliegue en Railway (un solo servicio)

El backend sirve también el frontend compilado: **una URL, un servicio, un volumen**. Sin CORS, sin cookies entre
dominios y los WebSockets funcionan en el mismo origen.

```
Railway ── servicio "rescuepets" ──┬─ /            → frontend (React compilado)
                                   ├─ /api/*       → API
                                   ├─ /ws          → WebSocket de notificaciones
                                   └─ /uploads/*   → fotos
            Volumen en /data  ─────┴─ /data/db (SQLite) · /data/uploads (fotos)
```

## 1. Subir el proyecto a GitHub
Desde la carpeta raíz (`RescuePets`). El `.gitignore` ya excluye `node_modules`, `.env`, `data/`, `uploads/` y `dist/`.
```
git init
git add .
git commit -m "RescuePets"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/rescuepets.git
git push -u origin main
```
> Antes de subir, comprueba con `git status` que **no** aparece ningún `.env`.

## 2. Crear el servicio
1. railway.com → **New Project → Deploy from GitHub repo** → elige el repositorio (carpeta raíz, sin cambiar "Root Directory").
2. Railway lee `railway.json` y `package.json`: compila con `npm run build` (frontend + dependencias del backend) y arranca con `npm start`.
   El healthcheck es `/api/health`.

## 3. Volumen (imprescindible: sin él se pierden usuarios y fotos en cada despliegue)
Servicio → **Settings → Volumes → New Volume** → *Mount path*: `/data`.

## 4. Variables (servicio → Variables)
| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `SERVE_FRONTEND` | `true` |
| `TRUST_PROXY` | `1` |
| `DATA_DIR` | `/data/db` |
| `UPLOAD_DIR` | `/data/uploads` |

| `VAPID_PUBLIC_KEY` | clave pública (ver abajo) |
| `VAPID_PRIVATE_KEY` | clave privada (ver abajo; es secreta) |
| `VAPID_SUBJECT` | `mailto:tu-correo@ejemplo.com` |

**Notificaciones al dispositivo (Web Push):** genera tus claves una sola vez con `npx web-push generate-vapid-keys` (desde `backend/`) y ponlas en Variables. Sin ellas el sitio funciona igual, solo que sin avisos fuera de la página. No las cambies después: los dispositivos ya suscritos dejarían de recibir avisos. En iPhone/iPad solo funcionan con la app añadida a la pantalla de inicio.

`PORT` lo pone Railway. No necesitas `CLIENT_ORIGIN` ni `PUBLIC_URL` (todo es mismo origen).
Opcional (Google Sheets): `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_API_KEY`, `GOOGLE_SHEETS_EXPORT_INTERVAL_MIN`
(ver `backend/.env.example`). **Nunca** pongas la API key en el código ni en GitHub: solo en Variables.

## 5. Dominio público
Servicio → **Settings → Networking → Generate Domain**. Abre `https://TU-APP.up.railway.app` y prueba también `/api/health`.

## Si algo falla
- **El build falla por la versión de Node**: el proyecto requiere Node 24 (`.node-version`). Fija la variable de versión de Node que indique el builder en los logs.
- **`EACCES` al escribir en `/data`**: añade la variable `RAILWAY_RUN_UID=0`.
- **Cierra sesión sola / "Origen no permitido"**: accede por la URL HTTPS del servicio, no por otra.
- **Exportación a Sheets**: `npm run export:sheets` se puede ejecutar desde la consola de Railway (`railway run`) o dejar el envío automático con `GOOGLE_SHEETS_EXPORT_INTERVAL_MIN`.

## Límites a tener en cuenta (plan gratuito, solo para pruebas)
- 0,5 GB de volumen y 0,5 GB de RAM: las fotos se comprimen (WebP ≤ 1600 px), pero el disco se llena con el uso.
- **Una sola réplica** (SQLite no admite varias).
- Copia de seguridad: el volumen es el único lugar donde viven los datos; para algo más serio, pasa al plan de pago y/o a una base externa.
- Al migrar a un plan mejor no cambia nada de esta configuración.
