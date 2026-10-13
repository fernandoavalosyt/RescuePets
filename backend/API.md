# API RescuePets

Base: `http://localhost:5000/api` · Sesión por cookie `httpOnly` → en `fetch` usar siempre `credentials: 'include'`.
Errores: `{ "error": "mensaje", "fields": { campo: "mensaje" } }` (`fields` solo en validaciones 400).

## Auth
| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/auth/register` | JSON `{identifier, password, confirmPassword}` | 201 |
| POST | `/auth/login` | JSON `{identifier, password}` | `{user}` + cookie |
| GET | `/auth/me` | – | `{user}` → `{id, username, usernameSet, displayName, identifier, registeredLocation}` |
| POST | `/auth/logout` | – | 200 |

## Perfil — módulo `users`
| Método | Ruta | Descripción |
|---|---|---|
| PATCH | `/users/me` | JSON `{username?, displayName?}`. Username: 3–30, letras/números/_, empieza con letra, se guarda en minúsculas; 409 si está en uso. Marca `usernameSet=true` (límite 10/hora) |
| PUT | `/users/me/location` | JSON `{latitude, longitude}` (números). Guarda la **ubicación registrada** del usuario; es privada: solo aparece en `/auth/me` como `registeredLocation: {latitude, longitude, updatedAt}` (o `null`), nunca en perfiles ni publicaciones |
| DELETE | `/users/me/location` | Elimina la ubicación registrada |
| GET | `/users/:username` | Perfil público `{id, username, displayName, createdAt, postCount}` |

## Publicar — módulo `publish`
`POST /publish` · `multipart/form-data` · **autor = usuario de la sesión** (no se envía)

| Campo | Tipo | Reglas |
|---|---|---|
| `content` | texto | obligatorio, 3–2000 |
| `type` | texto | `found` (default) · `lost` · `adoption` · `general` |
| `species` | texto | opcional: `dog` · `cat` · `other` |
| `location` | JSON string | opcional: `{placeName, address, city, country, latitude, longitude}` (lugar, dirección o coordenadas; lat/lng juntas) |
| `images` | archivos | 0–4, JPG/PNG/WebP, ≤5 MB c/u (se convierten a WebP sin EXIF) |

```js
const f = new FormData();
f.append('content', 'Encontré un cachorro…');
f.append('location', JSON.stringify({ placeName: 'Parque Central', latitude: 19.43, longitude: -99.13 }));
files.forEach((file) => f.append('images', file));
await fetch(`${API}/publish`, { method: 'POST', credentials: 'include', body: f }); // sin Content-Type manual
```
Respuesta `201 { post }`. Límite: 20 publicaciones/hora por usuario.

## Publicaciones (CRUD) — módulo `posts`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/posts?cursor&limit&user&type&species&lat&lng&radiusKm` | Feed (activas y resueltas), nuevas primero. `limit` 1–30 (def. 10). **Zona:** `lat`+`lng` (+`radiusKm`, def. 25, máx. 200) devuelve solo publicaciones con ubicación dentro de esa caja |
| GET | `/posts/mine?status&cursor&limit` | Mis publicaciones, incluye ocultas. `status`: `active`/`hidden`/`resolved` |
| GET | `/posts/:id` | Detalle |
| PATCH | `/posts/:id` | (botón **Editar** del frontend) JSON parcial: `content`, `type`, `species` (`null` limpia), `location` (objeto, o `null` para quitarla), `status` (`active`/`hidden`/`resolved`). Solo el autor |
| DELETE | `/posts/:id` | Borrado lógico. Solo el autor |
| POST | `/posts/:id/images` | multipart, campo `images`; máximo 4 en total por publicación. Solo el autor |
| DELETE | `/posts/:id/images/:mediaId` | Quita una imagen (y su archivo). Solo el autor |

## Me gusta — módulo `reactions`
| Método | Ruta | Respuesta |
|---|---|---|
| PUT | `/posts/:id/like` | `{liked: true, likes}` (idempotente) |
| DELETE | `/posts/:id/like` | `{liked: false, likes}` |

## Comentarios — módulo `comments`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/posts/:id/comments?cursor&limit` | Más antiguos primero, `limit` 1–50 (def. 20) → `{comments, nextCursor, total}` |
| POST | `/posts/:id/comments` | JSON `{content (1–1000), parentId?}`. Solo un nivel de respuestas → `201 {comment, commentCount}` (60/hora) |
| DELETE | `/comments/:id` | Lo borra el autor del comentario o el dueño de la publicación. Borra también sus respuestas → `{commentCount}` |

Comentario: `{id, postId, parentId, content, createdAt, author:{id,username,displayName}, mine}`.

Listados: `{ posts: [...], nextCursor }` → pasar `nextCursor` como `?cursor=` para la siguiente página (`null` = no hay más).
Códigos: 400 validación · 401 sin sesión · 403 publicación ajena · 404 no existe/oculta/borrada · 413 imagen grande · 429 límite.

### Objeto `post`
```json
{
  "id": 1, "content": "…", "type": "found", "species": "dog", "status": "active",
  "createdAt": 1791856333700, "updatedAt": 1791856333700,
  "author": { "id": 2, "username": "user_ab12", "displayName": "user_ab12" },
  "location": { "id": 1, "placeName": "…", "address": null, "city": null, "country": null, "latitude": 19.43, "longitude": -99.13 },
  "images": [{ "id": 5, "url": "http://localhost:5000/uploads/posts/2026/10/<uuid>.webp", "width": 1200, "height": 800 }],
  "counts": { "likes": 0, "comments": 0, "shares": 0 },
  "mine": true,
  "viewer": { "liked": false }
}
```
Fechas en milisegundos (`new Date(createdAt)`). `mine` indica si el usuario actual es el autor (para mostrar editar/borrar).

## Mantenimiento automático
- Cada hora: caducan las solicitudes de rescate sin respuesta (7 días) y se purgan notificaciones antiguas (leídas > 30 días, cualquiera > 120).
- Cada hora se eliminan **definitivamente** las publicaciones borradas hace más de 30 días (`DELETED_RETENTION_DAYS`): fila, imágenes (incluidas las de rescate) en disco, comentarios, reacciones y ubicación.
- Cada día se borran archivos de `uploads/` que ninguna fila referencia (con más de 24 h de antigüedad).

## Buscador — módulo `search`
`GET /search?q=perro` (mín. 2 caracteres) → `{query, users, posts, nextCursor}`
- **Publicaciones:** busca en el texto, el lugar, la especie y el tipo. Sin acentos, mayúsculas ni plurales ("PERROS", "adopcion", "gatos"), por prefijo y con todas las palabras (AND). Buscar "perro" encuentra también las publicaciones marcadas como perro aunque el texto diga "cachorro"; vale para cualquier animal que aparezca en el texto (conejo, ave, tortuga…). Solo devuelve publicaciones activas y resueltas (las rescatadas salen de las búsquedas).
- **Usuarios:** por username o nombre (máx. 8, solo en la primera página). `@nombre` busca solo usuarios.
- **Filtros:** `scope` (`all`/`posts`/`users`), `type`, `species`, **distancia** `lat`+`lng`+`radiusKm`, `cursor`, `limit` (1–30). Cada resultado trae `location` con las coordenadas del animal, estés donde estés.
- Se actualiza solo (índice FTS5 mantenido por triggers). 120 búsquedas/minuto por usuario.

## Rescates (con aprobación del autor) y logros — módulo `rescues`
Flujo anti-fraude: el rescatista **solicita**, el **autor valida**.
1. `POST /posts/:id/rescue` — rescatista. multipart: `note` (10–1000), `confirm="true"`, `images` (1–3 fotos de verificación). Solo publicaciones `active` de **otros** usuarios (propia → 403; con solicitud abierta → 409; si el autor ya te rechazó → 409). La publicación **no cambia de estado**: queda con `rescueRequest.status="pending"`. Avisa al autor. 10/día por usuario.
2. El autor decide:
   - `POST /posts/:id/rescue/approve` → pasa a `status:"rescued"`: sale del feed y de las búsquedas y entra en Logros. Avisa al rescatista.
   - `POST /posts/:id/rescue/reject` (JSON `{reason?}`, máx. 300) → sigue activa, se borran las fotos de la solicitud y se avisa al rescatista con el motivo.
3. `DELETE /posts/:id/rescue` — el rescatista **retira** su solicitud pendiente; o el autor/rescatista **deshace** un rescate aprobado (vuelve al feed y se borran las fotos).
Una solicitud sin respuesta **caduca a los 7 días** (se avisa a ambos). Mientras haya una solicitud pendiente la publicación no se puede editar (409).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/achievements?cursor&limit&mine=1` | Logros: rescates aprobados, más recientes primero. `mine=1` → los que yo rescaté |
| GET | `/achievements/stats` | `{total, rescuedByMe, myPostsRescued, pendingForMe}` |

En el `post`:
- `rescue` (rescate aprobado): `{id, note, createdAt, requestedAt, rescuer, images, canUndo}` o `null`.
- `rescueRequest` (solicitud pendiente): `{id, status:"pending", createdAt, rescuer, canDecide, mine, note?, images?}`. La **nota y las fotos solo las ven el autor y el solicitante**; el resto ve únicamente que hay un rescate en revisión.

## Notificaciones — módulo `notifications`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/notifications?group=nearby\|activity&cursor&limit` | `{notifications, nextCursor, counts:{unread,nearby,activity}}` (siempre solo las del usuario) |
| GET | `/notifications/unread-count` | `{unread, nearby, activity}` |
| POST | `/notifications/:id/read` · `/notifications/read-all?group=` | Marcar leídas → devuelve los contadores |
| GET/PUT | `/notifications/settings` | `{nearby: boolean, radiusKm: 5\|10\|25\|50}` (aviso por cercanía) |

Notificación: `{id, type, read, createdAt, actor:{id,username,displayName}|null, post:{id,snippet,thumbnail,status}|null, data}`.
Tipos: `nearby_pet` (data: distanceKm, postType, species, placeName) · `rescue_requested` · `rescue_approved` · `rescue_rejected` (data.reason) · `rescue_cancelled` · `rescue_undone` · `rescue_expired` · `comment` · `reply` (data.snippet).
**Cerca de ti:** al publicarse un animal (tipo encontrado/perdido/adopción) con coordenadas, se avisa a quienes tienen su ubicación registrada dentro de su radio (máx. 200 destinatarios, los más cercanos primero, sin avisar al autor y respetando su preferencia).

### Tiempo real (WebSocket)
`ws://HOST/ws` — se autentica con la misma cookie de sesión y exige el `Origin` del frontend. Solo servidor → cliente:
`{type:"ready", counts}` al conectar · `{type:"notification", notification, counts}` por cada notificación nueva.
Máx. 5 conexiones por usuario, latido cada 30 s y cierre `4401` si expira la sesión. Si el cliente no está conectado no se pierde nada: todo queda en `/notifications`.

## Exportación a Google Sheets — módulo `sheets-export`
Adaptación a Node del script Python original: envía por **POST JSON** a la Web App de Apps Script
`{ fecha_exportacion, total_usuarios, total_publicaciones, publicaciones_hoy }` (+ la API key).
Las publicaciones borradas no cuentan; `publicaciones_hoy` usa la hora local del servidor.
- Configuración en `.env` (ver `.env.example`): `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_API_KEY`, `GOOGLE_SHEETS_KEY_PARAM` (def. `api_key`), `GOOGLE_SHEETS_KEY_IN` (`body`|`query`).
- Manual: `npm run export:sheets` · Automático: `GOOGLE_SHEETS_EXPORT_INTERVAL_MIN=60` (0 = desactivado).
- En Apps Script: `const data = JSON.parse(e.postData.contents); if (data.api_key !== "TU_KEY") return error;`
- Seguridad: la key solo vive en `.env`, nunca se registra ni se devuelve; solo se aceptan URLs `https://script.google.com/...`; timeout de 15 s y 3 intentos ante fallos de red/5xx.

## Arquitectura
```
src/
  config/env.js            variables de entorno
  database/                conexión SQLite + migraciones versionadas
  shared/                  errores, rate limit, helpers HTTP, crypto
  modules/
    auth/      routes → controller → service → repository (+ validators, middleware)
    media/     procesamiento de imágenes (sharp) y subida (multer)
    posts/     CRUD + dominio de publicaciones (+ serializer, validators)
    publish/   alta de publicaciones con fotos (usa posts + media)
    users/     perfil, username y ubicación registrada
    search/    buscador de publicaciones y usuarios (FTS5)
    rescues/   solicitud de rescate, aprobación del autor y logros
    notifications/ notificaciones, avisos por cercanía y preferencias
    sheets-export/ exportación de métricas a Google Sheets
  realtime/gateway.js   WebSocket de notificaciones
    reactions/ me gusta
    comments/  comentarios y respuestas
  jobs/cleanup.js   limpieza periódica
    index.js   registro de módulos → app.js
```
Nuevo módulo (likes, comentarios, compartir): carpeta en `modules/`, migración nueva en `database/migrations.js`
(las tablas `post_reactions` y `comments` ya existen) y una línea en `modules/index.js`.

`npm run test:api` ejecuta la prueba de integración (servidor encendido) y limpia sus datos.
