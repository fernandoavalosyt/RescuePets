// Prueba de integración end-to-end: node test-api.js  (con el servidor corriendo).
// Crea un usuario temporal y lo elimina al final (con sus publicaciones e imágenes).
const sharp = require('sharp');

const BASE = process.env.API || 'http://localhost:5000/api';
const ORIGIN = 'http://localhost:5173';
let cookie = '';
let failures = 0;

async function call(method, path, { json, form, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Origin: ORIGIN, ...(cookie && { Cookie: cookie }), ...(json && { 'Content-Type': 'application/json' }), ...headers },
    body: json ? JSON.stringify(json) : form,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failures++;
}

async function png(color = '#c33', w = 1200, h = 800) {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
}
const file = (buf, name = 'a.png', type = 'image/png') => new Blob([buf], { type });

// Borra los usuarios de prueba (CASCADE: publicaciones, media, ubicaciones huérfanas) y sus archivos.
function cleanup(emails) {
  const fs = require('fs');
  const path = require('path');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(__dirname, 'data', 'rescuepets.db'));
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
  const marks = emails.map(() => '?').join(',');
  const urls = db.prepare(`SELECT m.url FROM post_media m JOIN posts p ON p.id = m.post_id
                           JOIN users u ON u.id = p.user_id WHERE u.email IN (${marks})`).all(...emails);
  const locs = db.prepare(`SELECT p.location_id AS id FROM posts p JOIN users u ON u.id = p.user_id
                           WHERE u.email IN (${marks}) AND p.location_id IS NOT NULL`).all(...emails);
  db.prepare(`DELETE FROM users WHERE email IN (${marks})`).run(...emails);
  for (const l of locs) db.prepare('DELETE FROM locations WHERE id = ?').run(l.id);
  for (const { url } of urls) fs.rmSync(path.join(__dirname, url), { force: true });
  db.close();
}

(async () => {
  const id =`t${Date.now()}@test.com`;
  const pw = 'Clave#Segura9x';
  await call('POST', '/auth/register', { json: { identifier: id, password: pw, confirmPassword: pw } });
  const login = await call('POST', '/auth/login', { json: { identifier: id, password: pw } });
  check('login', login.status === 200, JSON.stringify(login.body));
  const me = login.body.user;

  // ---- Publicar ----
  const f = new FormData();
  f.append('content', 'Encontré un cachorro marrón con collar');
  f.append('type', 'found');
  f.append('species', 'dog');
  f.append('location', JSON.stringify({ placeName: 'Parque Central', city: 'CDMX', latitude: 19.43, longitude: -99.13 }));
  f.append('images', file(await png()), 'a.png');
  f.append('images', file(await png('#3c3')), 'b.png');
  const pub = await call('POST', '/publish', { form: f });
  check('publish 201', pub.status === 201, JSON.stringify(pub.body));
  const post = pub.body.post;
  check('publish: autor = usuario autenticado', post?.author.id === me.id && post.mine === true);
  check('publish: 2 imágenes con url/id', post?.images.length === 2 && post.images[0].url.includes('/uploads/posts/'));
  check('publish: ubicación guardada', post?.location?.placeName === 'Parque Central');

  const noAuth = await fetch(BASE + '/publish', { method: 'POST', headers: { Origin: ORIGIN }, body: new FormData() });
  check('publish sin sesión => 401', noAuth.status === 401);

  const bad = new FormData(); bad.append('content', 'a'); bad.append('type', 'zzz');
  const badRes = await call('POST', '/publish', { form: bad });
  check('publish inválido => 400 con fields', badRes.status === 400 && badRes.body.fields?.content && badRes.body.fields?.type);

  const fake = new FormData(); fake.append('content', 'imagen falsa'); fake.append('images', new Blob(['no soy imagen'], { type: 'image/jpeg' }), 'x.jpg');
  const fakeRes = await call('POST', '/publish', { form: fake });
  check('publish con archivo falso => 400', fakeRes.status === 400, JSON.stringify(fakeRes.body));

  const many = new FormData(); many.append('content', 'demasiadas');
  for (let i = 0; i < 5; i++) many.append('images', file(await png()), `i${i}.png`);
  check('publish con 5 imágenes => 400', (await call('POST', '/publish', { form: many })).status === 400);

  // ---- Leer ----
  const one = await call('GET', `/posts/${post.id}`);
  check('GET /posts/:id', one.status === 200 && one.body.post.id === post.id);
  check('GET /posts/abc => 404', (await call('GET', '/posts/abc')).status === 404);
  const imgRes = await fetch(post.images[0].url);
  check('imagen accesible por su link', imgRes.status === 200 && imgRes.headers.get('content-type') === 'image/webp');

  for (let i = 1; i <= 3; i++) {
    const g = new FormData(); g.append('content', `Publicación extra ${i}`); g.append('type', i === 3 ? 'lost' : 'found');
    await call('POST', '/publish', { form: g });
  }
  const p1 = await call('GET', '/posts?limit=2');
  const p2 = await call('GET', `/posts?limit=2&cursor=${p1.body.nextCursor}`);
  const seen = [...p1.body.posts, ...p2.body.posts].map((p) => p.id);
  check('paginación por cursor sin repetidos', p1.body.nextCursor && new Set(seen).size === seen.length && seen.length === 4);
  check('filtro ?type=lost', (await call('GET', '/posts?type=lost')).body.posts.every((p) => p.type === 'lost'));
  check('filtro ?user=', (await call('GET', `/posts?user=${me.username}`)).body.posts.every((p) => p.author.username === me.username));
  check('cursor inválido => 400', (await call('GET', '/posts?cursor=xx')).status === 400);
  check('GET /posts/mine', (await call('GET', '/posts/mine')).body.posts.length === 4);

  // ---- Actualizar ----
  const upd = await call('PATCH', `/posts/${post.id}`, { json: { content: 'Ya tiene dueño, gracias', status: 'resolved', species: 'cat' } });
  check('PATCH contenido/estado/especie', upd.status === 200 && upd.body.post.status === 'resolved' && upd.body.post.species === 'cat' && upd.body.post.updatedAt >= post.updatedAt, JSON.stringify(upd.body));
  const loc = await call('PATCH', `/posts/${post.id}`, { json: { location: { placeName: 'Otra calle', latitude: 1, longitude: 2 } } });
  check('PATCH ubicación', loc.body.post?.location?.placeName === 'Otra calle');
  const noloc = await call('PATCH', `/posts/${post.id}`, { json: { location: null } });
  check('PATCH quitar ubicación', noloc.body.post?.location === null);
  check('PATCH vacío => 400', (await call('PATCH', `/posts/${post.id}`, { json: {} })).status === 400);
  check('PATCH estado inválido => 400', (await call('PATCH', `/posts/${post.id}`, { json: { status: 'deleted' } })).status === 400);
  check('PATCH no permite cambiar autor', (await call('PATCH', `/posts/${post.id}`, { json: { user_id: 999, content: 'hola mundo' } })).body.post?.author.id === me.id);

  // ---- Imágenes ----
  const add = new FormData(); add.append('images', file(await png('#33c')), 'c.png');
  const added = await call('POST', `/posts/${post.id}/images`, { form: add });
  check('POST /:id/images', added.status === 201 && added.body.post.images.length === 3, JSON.stringify(added.body));
  const add2 = new FormData(); add2.append('images', file(await png()), 'd.png'); add2.append('images', file(await png()), 'e.png');
  check('exceder 4 imágenes => 400', (await call('POST', `/posts/${post.id}/images`, { form: add2 })).status === 400);
  const rm = await call('DELETE', `/posts/${post.id}/images/${added.body.post.images[2].id}`);
  check('DELETE /:id/images/:mediaId', rm.status === 200 && rm.body.post.images.length === 2);
  check('imagen borrada ya no existe en disco', (await fetch(added.body.post.images[2].url)).status === 404);

  // ---- Otro usuario ----
  const saved = cookie;
  const id2 = `u${Date.now()}@test.com`;
  await call('POST', '/auth/register', { json: { identifier: id2, password: pw, confirmPassword: pw } });
  cookie = '';
  await call('POST', '/auth/login', { json: { identifier: id2, password: pw } });
  check('otro usuario ve la publicación', (await call('GET', `/posts/${post.id}`)).body.post?.mine === false);
  check('otro usuario no puede editar => 403', (await call('PATCH', `/posts/${post.id}`, { json: { content: 'hackeado!!' } })).status === 403);
  check('otro usuario no puede borrar => 403', (await call('DELETE', `/posts/${post.id}`)).status === 403);
  check('otro usuario no puede subir imágenes => 403', (await call('POST', `/posts/${post.id}/images`, { form: add })).status === 403);
  const hide = (cookie = saved, await call('PATCH', `/posts/${post.id}`, { json: { status: 'hidden' } }));
  cookie = ''; await call('POST', '/auth/login', { json: { identifier: id2, password: pw } });
  check('publicación oculta no visible a otros => 404', hide.status === 200 && (await call('GET', `/posts/${post.id}`)).status === 404);
  check('oculta no aparece en el feed', !(await call('GET', '/posts?limit=30')).body.posts.some((p) => p.id === post.id));

  // ---- Borrar ----
  cookie = saved;
  check('mis ocultas aparecen en /mine', (await call('GET', '/posts/mine?status=hidden')).body.posts.some((p) => p.id === post.id));
  check('DELETE /posts/:id', (await call('DELETE', `/posts/${post.id}`)).status === 200);
  check('borrada => 404', (await call('GET', `/posts/${post.id}`)).status === 404);
  check('borrada no se puede editar => 404', (await call('PATCH', `/posts/${post.id}`, { json: { content: 'de nuevo' } })).status === 404);

  // ================= v2: username, zona, likes, comentarios, limpieza =================
  console.log('--- v2 ---');
  check('usernameSet=false al inicio', me.usernameSet === false);
  check('username inválido => 400', (await call('PATCH', '/users/me', { json: { username: 'a b' } })).status === 400);
  check('username reservado => 400', (await call('PATCH', '/users/me', { json: { username: 'admin' } })).status === 400);
  const uname = `t_${Date.now().toString(36)}`;
  const setU = await call('PATCH', '/users/me', { json: { username: uname.toUpperCase() } });
  check('elegir username (normaliza a minúsculas)', setU.status === 200 && setU.body.user.username === uname && setU.body.user.usernameSet === true, JSON.stringify(setU.body));
  check('displayName sigue al username', setU.body.user?.displayName === uname);
  check('/auth/me refleja usernameSet', (await call('GET', '/auth/me')).body.user.usernameSet === true);
  const profile = await call('GET', `/users/${uname}`);
  check('GET /users/:username', profile.status === 200 && profile.body.user.username === uname);
  check('GET /users/inexistente => 404', (await call('GET', '/users/nadie_existe')).status === 404);

  const f2 = new FormData();
  f2.append('content', 'Gatito visto cerca del mercado');
  f2.append('species', 'cat');
  f2.append('location', JSON.stringify({ placeName: 'Mercado', city: 'Coyoacán', latitude: 19.35, longitude: -99.16 }));
  f2.append('images', file(await png()), 'z.png');
  const p = (await call('POST', '/publish', { form: f2 })).body.post;
  check('feed incluye viewer.liked=false', (await call('GET', `/posts/${p.id}`)).body.post.viewer.liked === false);

  const near = await call('GET', '/posts?lat=19.36&lng=-99.15&radiusKm=10');
  check('zona cercana incluye el post', near.status === 200 && near.body.posts.some((x) => x.id === p.id), JSON.stringify(near.body).slice(0, 200));
  check('zona lejana lo excluye', !(await call('GET', '/posts?lat=40.4&lng=-3.7&radiusKm=10')).body.posts.some((x) => x.id === p.id));
  check('zona inválida => 400', (await call('GET', '/posts?lat=999&lng=0')).status === 400);
  check('lat sin lng => 400', (await call('GET', '/posts?lat=19')).status === 400);

  const l1 = await call('PUT', `/posts/${p.id}/like`);
  const l2 = await call('PUT', `/posts/${p.id}/like`);
  check('like idempotente', l1.body.likes === 1 && l2.body.likes === 1 && l2.body.liked === true, JSON.stringify(l2.body));
  check('post muestra liked=true y likes=1', (await call('GET', `/posts/${p.id}`)).body.post.viewer.liked === true);
  check('unlike', (await call('DELETE', `/posts/${p.id}/like`)).body.likes === 0);
  check('like a post inexistente => 404', (await call('PUT', '/posts/999999/like')).status === 404);

  const c1 = await call('POST', `/posts/${p.id}/comments`, { json: { content: '  ¿Sigue ahí?  ' } });
  check('crear comentario', c1.status === 201 && c1.body.comment.content === '¿Sigue ahí?' && c1.body.commentCount === 1, JSON.stringify(c1.body));
  const c2 = await call('POST', `/posts/${p.id}/comments`, { json: { content: 'Sí, lo vi hoy', parentId: c1.body.comment.id } });
  check('responder comentario', c2.status === 201 && c2.body.comment.parentId === c1.body.comment.id && c2.body.commentCount === 2);
  check('respuesta a respuesta => 400', (await call('POST', `/posts/${p.id}/comments`, { json: { content: 'x', parentId: c2.body.comment.id } })).status === 400);
  check('comentario vacío => 400', (await call('POST', `/posts/${p.id}/comments`, { json: { content: '   ' } })).status === 400);
  check('comentario >1000 => 400', (await call('POST', `/posts/${p.id}/comments`, { json: { content: 'a'.repeat(1001) } })).status === 400);
  const lc = await call('GET', `/posts/${p.id}/comments?limit=1`);
  const lc2 = await call('GET', `/posts/${p.id}/comments?limit=1&cursor=${lc.body.nextCursor}`);
  check('listar comentarios con cursor', lc.body.comments.length === 1 && lc2.body.comments[0].id === c2.body.comment.id && lc2.body.nextCursor === null && lc.body.total === 2);
  check('post refleja comments=2', (await call('GET', `/posts/${p.id}`)).body.post.counts.comments === 2);

  // otro usuario
  const mainCookie = cookie;
  cookie = '';
  await call('POST', '/auth/login', { json: { identifier: id2, password: pw } });
  const c3 = await call('POST', `/posts/${p.id}/comments`, { json: { content: 'Yo también lo vi' } });
  check('otro usuario comenta', c3.status === 201 && c3.body.comment.mine === true);
  check('no puede borrar comentario ajeno => 403', (await call('DELETE', `/comments/${c1.body.comment.id}`)).status === 403);
  check('puede borrar el suyo', (await call('DELETE', `/comments/${c3.body.comment.id}`)).status === 200);
  check('username duplicado => 409', (await call('PATCH', '/users/me', { json: { username: uname } })).status === 409);

  cookie = mainCookie;
  const del = await call('DELETE', `/comments/${c1.body.comment.id}`); // dueño del post/autor + cascada de respuestas
  check('borrar comentario con respuestas (cascada) ajusta contador', del.status === 200 && del.body.commentCount === 0, JSON.stringify(del.body));

  // limpieza
  const fsx = require('fs');
  const pathx = require('path');
  const fileOnDisk = (u) => fsx.existsSync(pathx.join(__dirname, new URL(u).pathname));
  check('imagen existe antes de purgar', fileOnDisk(p.images[0].url));
  await call('DELETE', `/posts/${p.id}`);
  const job = require('./src/jobs/cleanup');
  check('no se purga antes del plazo', (await job.purgeDeletedPosts(60_000)) === 0 && fileOnDisk(p.images[0].url));
  await new Promise((r) => setTimeout(r, 10));
  check('purga elimina publicación borrada', (await job.purgeDeletedPosts(0)) >= 1);
  check('purga elimina el archivo', !fileOnDisk(p.images[0].url));
  const orphan = pathx.join(__dirname, 'uploads', 'posts', 'huerfano.webp');
  fsx.mkdirSync(pathx.dirname(orphan), { recursive: true });
  fsx.writeFileSync(orphan, 'x');
  check('archivo huérfano reciente se respeta', (await job.purgeOrphanFiles(60_000)) === 0 && fsx.existsSync(orphan));
  await job.purgeOrphanFiles(0);
  check('archivo huérfano se elimina', !fsx.existsSync(orphan));

  // ================= v3: ubicación registrada =================
  console.log('--- v3 ---');
  check('registeredLocation null al inicio', (await call('GET', '/auth/me')).body.user.registeredLocation === null);
  check('ubicación inválida => 400', (await call('PUT', '/users/me/location', { json: { latitude: 200, longitude: 0 } })).status === 400);
  check('ubicación como texto => 400', (await call('PUT', '/users/me/location', { json: { latitude: '19', longitude: '-99' } })).status === 400);
  const home = await call('PUT', '/users/me/location', { json: { latitude: 19.43, longitude: -99.13 } });
  check('guardar ubicación registrada', home.status === 200 && home.body.user.registeredLocation.latitude === 19.43, JSON.stringify(home.body));
  check('/auth/me devuelve la ubicación registrada', (await call('GET', '/auth/me')).body.user.registeredLocation?.longitude === -99.13);
  const prof = await call('GET', `/users/${uname}`);
  check('perfil público NO expone la ubicación', !JSON.stringify(prof.body).includes('99.13') && !('registeredLocation' in prof.body.user));
  const pv = new FormData(); pv.append('content', 'Visto durante un viaje'); pv.append('location', JSON.stringify({ placeName: 'Otra ciudad', latitude: 41.38, longitude: 2.17 }));
  const trip = (await call('POST', '/publish', { form: pv })).body.post;
  check('la publicación lleva SU ubicación (no la registrada)', trip.location.latitude === 41.38 && trip.location.longitude === 2.17);
  check('la publicación no filtra la ubicación registrada', !JSON.stringify(trip).includes('19.43'));
  check('el feed cerca de Barcelona encuentra el post de viaje', (await call('GET', '/posts?lat=41.4&lng=2.17&radiusKm=10')).body.posts.some((x) => x.id === trip.id));
  check('quitar ubicación registrada', (await call('DELETE', '/users/me/location')).body.user.registeredLocation === null);
  await call('DELETE', `/posts/${trip.id}`);

  // ================= v4: búsqueda y rescates (logros) =================
  console.log('--- v4 ---');
  const id3 = `v${Date.now()}@test.com`;
  await call('POST', '/auth/register', { json: { identifier: id3, password: pw, confirmPassword: pw } });
  const cookieA = cookie;
  const loginAs = async (email) => { cookie = ''; await call('POST', '/auth/login', { json: { identifier: email, password: pw } }); const c = cookie; cookie = cookieA; return c; };
  const cookieB = await loginAs(id2);
  const cookieC = await loginAs(id3);
  const as = async (c, fn) => { const prev = cookie; cookie = c; try { return await fn(); } finally { cookie = prev; } };
  const mk = async (fields, nImgs = 0) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    for (let i = 0; i < nImgs; i++) f.append('images', file(await png()), `p${i}.png`);
    return (await call('POST', '/publish', { form: f })).body.post;
  };
  const ids = (r) => r.body.posts.map((p) => p.id);

  const dog = await mk({ content: 'Cachorro café en la banqueta', species: 'dog', type: 'lost', location: JSON.stringify({ placeName: 'Plaza Mayor', city: 'Coyoacán', latitude: 19.35, longitude: -99.16 }) }, 1);
  const cat = await mk({ content: 'Gatito gris duerme en el jardín', species: 'cat', location: JSON.stringify({ placeName: 'Jardín Botánico', latitude: 41.38, longitude: 2.17 }) });
  const rabbit = await mk({ content: 'Conejo blanco con manchas', species: 'other' });
  const adopt = await mk({ content: 'Busca hogar: adopción responsable', type: 'adoption' });

  // --- Búsqueda ---
  check('buscar "perro" (por especie, aunque el texto diga cachorro)', ids(await call('GET', '/search?q=perro')).includes(dog.id));
  check('"perro" no devuelve el gato', !ids(await call('GET', '/search?q=perro')).includes(cat.id));
  check('plural "PERROS" (mayúsculas)', ids(await call('GET', '/search?q=PERROS')).includes(dog.id));
  check('"gatos" encuentra gatito', ids(await call('GET', '/search?q=gatos')).includes(cat.id));
  check('cualquier animal en el texto: "conejo"', ids(await call('GET', '/search?q=conejo')).includes(rabbit.id));
  check('sin acentos: "adopcion" encuentra "adopción"', ids(await call('GET', '/search?q=adopcion')).includes(adopt.id));
  check('por lugar sin acento: "jardin"', ids(await call('GET', '/search?q=jardin')).includes(cat.id));
  check('varias palabras (AND): "gatito jardin"', ids(await call('GET', '/search?q=gatito%20jardin')).includes(cat.id));
  check('"gatito banqueta" no coincide', ids(await call('GET', '/search?q=gatito%20banqueta')).length === 0);
  const near1 = await call('GET', '/search?q=gato&lat=41.4&lng=2.17&radiusKm=10');
  const far1 = await call('GET', '/search?q=gato&lat=19.4&lng=-99.1&radiusKm=10');
  check('búsqueda + distancia: cerca incluye', ids(near1).includes(cat.id));
  check('búsqueda + distancia: lejos excluye', !ids(far1).includes(cat.id));
  check('ubicación del animal visible en el resultado', near1.body.posts.find((x) => x.id === cat.id)?.location?.latitude === 41.38);
  const su = await call('GET', `/search?q=${uname.slice(0, 7)}`);
  check('buscar usuarios por username', su.body.users.some((u) => u.username === uname) && su.body.users[0].postCount >= 1, JSON.stringify(su.body.users));
  const at = await call('GET', `/search?q=@${uname}`);
  check('"@usuario" busca solo usuarios', at.body.users.some((u) => u.username === uname) && at.body.posts.length === 0);
  check('scope=posts omite usuarios', (await call('GET', `/search?q=${uname.slice(0, 7)}&scope=posts`)).body.users.length === 0);
  check('consulta corta => 400', (await call('GET', '/search?q=a')).status === 400);
  check('sin q => 400', (await call('GET', '/search')).status === 400);
  check('scope inválido => 400', (await call('GET', '/search?q=perro&scope=x')).status === 400);
  const inj = await call('GET', `/search?q=${encodeURIComponent('"* OR NEAR( "x" AND NOT')}`);
  check('sintaxis FTS maliciosa no rompe la búsqueda', inj.status === 200, JSON.stringify(inj.body));
  check('búsqueda sin sesión => 401', (await as('', () => call('GET', '/search?q=perro'))).status === 401);
  await mk({ content: 'Otro conejo marrón' }); await mk({ content: 'Conejo travieso' });
  const sp1 = await call('GET', '/search?q=conejo&limit=2');
  const sp2 = await call('GET', `/search?q=conejo&limit=2&cursor=${sp1.body.nextCursor}`);
  check('búsqueda paginada sin repetidos', sp1.body.posts.length === 2 && sp1.body.nextCursor && sp2.body.posts.length >= 1 && !ids(sp2).some((i) => ids(sp1).includes(i)));
  check('con cursor ya no repite usuarios', sp2.body.users.length === 0);
  check('editar texto reindexa: antes no, después sí', ids(await call('GET', '/search?q=tortuga')).length === 0
    && (await call('PATCH', `/posts/${rabbit.id}`, { json: { content: 'Tortuga verde en el parque' } })).status === 200
    && ids(await call('GET', '/search?q=tortuga')).includes(rabbit.id) && !ids(await call('GET', '/search?q=manchas')).includes(rabbit.id));

  // --- Rescates con aprobación del autor (A = autor, B y C = rescatistas) ---
  const rescueForm = async (n = 2, note = 'Lo recogí con su dueña adoptiva, ya está en casa', confirm = 'true') => {
    const f = new FormData();
    if (note) f.append('note', note);
    if (confirm) f.append('confirm', confirm);
    for (let i = 0; i < n; i++) f.append('images', file(await png('#3a3')), `r${i}.png`);
    return f;
  };
  const reqRescue = (c, postId, n = 2) => as(c, async () => call('POST', `/posts/${postId}/rescue`, { form: await rescueForm(n) }));
  const notifs = async (c, q = '') => (await as(c, () => call('GET', `/notifications${q}`))).body;

  check('rescate sin sesión => 401', (await as('', async () => call('POST', `/posts/${dog.id}/rescue`, { form: await rescueForm() }))).status === 401);
  check('no puedes rescatar tu propia publicación => 403', (await call('POST', `/posts/${dog.id}/rescue`, { form: await rescueForm() })).status === 403);
  const noData = await as(cookieB, async () => call('POST', `/posts/${dog.id}/rescue`, { form: await rescueForm(0, '', '') }));
  check('solicitud sin nota/foto/confirmación => 400 con fields', noData.status === 400 && noData.body.fields.note && noData.body.fields.images && noData.body.fields.confirm, JSON.stringify(noData.body));
  check('solicitud con más de 3 fotos => 400', (await reqRescue(cookieB, dog.id, 4)).status === 400);
  check('solicitud con archivo falso => 400', (await as(cookieB, async () => {
    const f = new FormData(); f.append('note', 'Nota suficientemente larga'); f.append('confirm', 'true');
    f.append('images', new Blob(['no soy imagen'], { type: 'image/png' }), 'x.png');
    return call('POST', `/posts/${dog.id}/rescue`, { form: f });
  })).status === 400);
  check('sigue activa y sin solicitud tras intentos fallidos', (await call('GET', `/posts/${dog.id}`)).body.post.rescueRequest === null);

  // 1) B solicita: NO cambia el estado, queda pendiente de aprobación
  const q1 = await reqRescue(cookieB, dog.id);
  check('B solicita el rescate => 201 y la publicación sigue "active"', q1.status === 201 && q1.body.post.status === 'active' && q1.body.post.rescueRequest.status === 'pending', JSON.stringify(q1.body));
  check('B (solicitante) ve su nota y fotos; no puede decidir', q1.body.post.rescueRequest.mine === true && q1.body.post.rescueRequest.canDecide === false && q1.body.post.rescueRequest.images.length === 2);
  const asA = (await call('GET', `/posts/${dog.id}`)).body.post.rescueRequest;
  check('A (autor) ve nota, fotos de verificación y puede decidir', asA.canDecide === true && asA.note.startsWith('Lo recogí') && asA.images.length === 2 && asA.rescuer.id === q1.body.post.rescueRequest.rescuer.id);
  check('fotos de verificación accesibles para el autor', (await fetch(asA.images[0].url)).status === 200);
  const asC = (await as(cookieC, () => call('GET', `/posts/${dog.id}`))).body.post.rescueRequest;
  check('un tercero NO ve la nota ni las fotos', asC.mine === false && asC.canDecide === false && !('note' in asC) && !('images' in asC));
  check('pendiente: sigue en el feed y no es logro', ids(await call('GET', '/posts?limit=30')).includes(dog.id) && !(await call('GET', '/achievements')).body.posts.some((x) => x.id === dog.id));
  check('pendiente: no hay otra solicitud (C) => 409', (await reqRescue(cookieC, dog.id)).status === 409);
  check('pendiente: B no puede duplicar => 409', (await reqRescue(cookieB, dog.id)).status === 409);
  check('pendiente: el autor no puede editar => 409', (await call('PATCH', `/posts/${dog.id}`, { json: { content: 'cambio' } })).status === 409);
  check('solo el autor aprueba: B => 403, C => 403', (await as(cookieB, () => call('POST', `/posts/${dog.id}/rescue/approve`))).status === 403
    && (await as(cookieC, () => call('POST', `/posts/${dog.id}/rescue/approve`))).status === 403);
  check('solo el autor rechaza: B => 403', (await as(cookieB, () => call('POST', `/posts/${dog.id}/rescue/reject`, { json: {} }))).status === 403);
  check('el autor no "retira" la solicitud (debe rechazar) => 403', (await call('DELETE', `/posts/${dog.id}/rescue`)).status === 403);
  check('un tercero no puede retirar => 403', (await as(cookieC, () => call('DELETE', `/posts/${dog.id}/rescue`))).status === 403);

  // notificación al autor
  const nA = await notifs(cookieA);
  const reqN = nA.notifications.find((n) => n.type === 'rescue_requested' && n.post?.id === dog.id);
  check('A recibe notificación "rescue_requested" sin leer', !!reqN && reqN.read === false && reqN.actor.id === q1.body.post.rescueRequest.rescuer.id && nA.counts.unread >= 1, JSON.stringify(nA.counts));
  check('la notificación trae el resumen de la publicación', reqN.post.snippet.startsWith('Cachorro') && reqN.post.thumbnail?.includes('/uploads/'));

  // 2b) A rechaza con motivo
  const rejUrl = asA.images[0].url;
  const rej = await call('POST', `/posts/${dog.id}/rescue/reject`, { json: { reason: 'La foto no corresponde al animalito' } });
  check('A rechaza => la publicación sigue activa sin solicitud', rej.status === 200 && rej.body.post.status === 'active' && rej.body.post.rescueRequest === null);
  check('rechazar borra las fotos de la solicitud', (await fetch(rejUrl)).status === 404);
  const nB = await notifs(cookieB);
  const rejN = nB.notifications.find((n) => n.type === 'rescue_rejected');
  check('B recibe "rescue_rejected" con el motivo', rejN?.data?.reason === 'La foto no corresponde al animalito' && rejN.post.id === dog.id);
  check('rechazar de nuevo sin solicitud => 409', (await call('POST', `/posts/${dog.id}/rescue/reject`, { json: {} })).status === 409);
  check('B no puede volver a solicitar tras el rechazo => 409', (await reqRescue(cookieB, dog.id)).status === 409);
  check('motivo >300 caracteres => 400 (con solicitud nueva de C)', await (async () => {
    await reqRescue(cookieC, dog.id, 1);
    const r = await call('POST', `/posts/${dog.id}/rescue/reject`, { json: { reason: 'x'.repeat(301) } });
    return r.status === 400;
  })());

  // C retira su solicitud
  const cancelUrl = (await as(cookieC, () => call('GET', `/posts/${dog.id}`))).body.post.rescueRequest.images[0].url;
  const cancel = await as(cookieC, () => call('DELETE', `/posts/${dog.id}/rescue`));
  check('C retira su solicitud pendiente', cancel.status === 200 && cancel.body.post.rescueRequest === null && (await fetch(cancelUrl)).status === 404);
  check('A recibe "rescue_cancelled"', (await notifs(cookieA)).notifications.some((n) => n.type === 'rescue_cancelled'));

  // 2a) C solicita de nuevo y A APRUEBA
  const q2 = await reqRescue(cookieC, dog.id);
  check('C solicita otra vez', q2.status === 201);
  const appr = await call('POST', `/posts/${dog.id}/rescue/approve`);
  const rp = appr.body.post;
  check('A aprueba => estado "rescued" y rescate con nota y fotos', appr.status === 200 && rp.status === 'rescued' && rp.rescue.images.length === 2 && rp.rescue.note.startsWith('Lo recogí') && rp.rescueRequest === null, JSON.stringify(appr.body));
  check('C recibe "rescue_approved"', (await notifs(cookieC)).notifications.some((n) => n.type === 'rescue_approved' && n.post.id === dog.id));
  check('aprobar de nuevo => 409', (await call('POST', `/posts/${dog.id}/rescue/approve`)).status === 409);
  check('fotos de verificación accesibles por link', (await fetch(rp.rescue.images[0].url)).status === 200);
  check('ya no aparece en el feed', !ids(await call('GET', '/posts?limit=30')).includes(dog.id));
  check('ya no aparece en la búsqueda', !ids(await call('GET', '/search?q=perro')).includes(dog.id));
  check('ya no aparece en "cerca de mí"', !ids(await call('GET', '/posts?lat=19.35&lng=-99.16&radiusKm=10')).includes(dog.id));
  const ach = await call('GET', '/achievements');
  check('aparece en Logros con su rescate', ach.status === 200 && ach.body.posts.some((x) => x.id === dog.id && x.rescue?.note));
  check('mis publicaciones muestran el estado rescatado', (await call('GET', '/posts/mine?status=rescued')).body.posts.some((x) => x.id === dog.id));
  const stA = (await call('GET', '/achievements/stats')).body;
  const stC = (await as(cookieC, () => call('GET', '/achievements/stats'))).body;
  check('stats: total, mis publicaciones rescatadas y rescates por mí', stA.total >= 1 && stA.myPostsRescued === 1 && stC.rescuedByMe === 1 && stA.pendingForMe === 0, JSON.stringify([stA, stC]));
  check('Logros ?mine=1 (quien rescató)', (await as(cookieC, () => call('GET', '/achievements?mine=1'))).body.posts.some((x) => x.id === dog.id)
    && !(await call('GET', '/achievements?mine=1')).body.posts.some((x) => x.id === dog.id));
  check('nueva solicitud sobre rescatada => 409', (await reqRescue(cookieB, dog.id)).status === 409);
  check('detalle de rescatada (canUndo autor y rescatista, no terceros)',
    (await call('GET', `/posts/${dog.id}`)).body.post.rescue.canUndo === true
    && (await as(cookieC, () => call('GET', `/posts/${dog.id}`))).body.post.rescue.canUndo === true
    && (await as(cookieB, () => call('GET', `/posts/${dog.id}`))).body.post.rescue.canUndo === false);
  check('se puede dar like/comentar un logro', (await call('PUT', `/posts/${dog.id}/like`)).status === 200
    && (await as(cookieB, () => call('POST', `/posts/${dog.id}/comments`, { json: { content: '¡Felicidades!' } }))).status === 201);
  check('no se puede editar una publicación rescatada => 409', (await call('PATCH', `/posts/${dog.id}`, { json: { content: 'cambio' } })).status === 409);
  check('tercero no puede deshacer => 403', (await as(cookieB, () => call('DELETE', `/posts/${dog.id}/rescue`))).status === 403);
  const rescueImgUrl = rp.rescue.images[0].url;
  const undo = await as(cookieC, () => call('DELETE', `/posts/${dog.id}/rescue`));
  check('quien rescató puede deshacer: vuelve a activa', undo.status === 200 && undo.body.post.status === 'active' && undo.body.post.rescue === null);
  check('A recibe "rescue_undone"', (await notifs(cookieA)).notifications.some((n) => n.type === 'rescue_undone'));
  check('deshacer borra las fotos de verificación', !fileOnDisk(rescueImgUrl));
  check('vuelve al feed y a la búsqueda', ids(await call('GET', '/posts?limit=30')).includes(dog.id) && ids(await call('GET', '/search?q=perro')).includes(dog.id));
  check('deshacer sin rescate => 404', (await call('DELETE', `/posts/${dog.id}/rescue`)).status === 404);

  // el autor también puede deshacer; la purga elimina fotos de rescates
  await reqRescue(cookieC, dog.id, 1);
  check('pendingForMe cuenta solicitudes por decidir', (await call('GET', '/achievements/stats')).body.pendingForMe === 1);
  await call('POST', `/posts/${dog.id}/rescue/approve`);
  check('el autor puede deshacer el rescate', (await call('DELETE', `/posts/${dog.id}/rescue`)).body.post.status === 'active');

  // caducidad de solicitudes sin respuesta
  const jobv4 = require('./src/jobs/cleanup');
  const expUrl = (await reqRescue(cookieC, dog.id, 1)).body.post.rescueRequest.images[0].url;
  check('solicitud reciente no caduca', (await jobv4.expireRescueRequests()) === 0 && fileOnDisk(expUrl));
  await new Promise((r) => setTimeout(r, 10));
  const rescuesSvc = require('./src/modules/rescues').service;
  check('solicitud sin respuesta caduca (se limpia y avisa a ambos)', (await rescuesSvc.expirePending(0)) === 1 && !fileOnDisk(expUrl)
    && (await call('GET', `/posts/${dog.id}`)).body.post.rescueRequest === null);
  check('autor y rescatista reciben "rescue_expired"', (await notifs(cookieA)).notifications.some((n) => n.type === 'rescue_expired')
    && (await notifs(cookieC)).notifications.some((n) => n.type === 'rescue_expired'));

  // publicación rescatada y luego borrada
  await reqRescue(cookieC, dog.id, 1);
  await call('POST', `/posts/${dog.id}/rescue/approve`);
  const rescueUrl3 = (await call('GET', `/posts/${dog.id}`)).body.post.rescue.images[0].url;
  await call('DELETE', `/posts/${dog.id}`);
  check('publicación rescatada y borrada sale de Logros', !(await call('GET', '/achievements')).body.posts.some((x) => x.id === dog.id));
  await new Promise((r) => setTimeout(r, 10));
  await jobv4.purgeDeletedPosts(0);
  check('la purga elimina también las fotos del rescate', !fileOnDisk(rescueUrl3));

  // ================= Notificaciones =================
  console.log('--- notificaciones ---');
  check('notificaciones sin sesión => 401', (await as('', () => call('GET', '/notifications'))).status === 401);
  // (las notificaciones del rescate se borraron junto con la publicación purgada: se generan otras)
  await as(cookieC, () => call('POST', `/posts/${cat.id}/comments`, { json: { content: 'Primer comentario' } }));
  await as(cookieB, () => call('POST', `/posts/${cat.id}/comments`, { json: { content: 'Segundo comentario' } }));
  await as(cookieB, () => call('POST', `/posts/${cat.id}/comments`, { json: { content: 'Tercer comentario' } }));
  const listA = await notifs(cookieA);
  check('listado con contadores', Array.isArray(listA.notifications) && listA.counts.unread > 0 && listA.counts.activity > 0, JSON.stringify(listA.counts) + ' n=' + listA.notifications.length);
  const firstUnread = listA.notifications.find((n) => !n.read);
  check('ajeno no puede marcar mi notificación => 404', (await as(cookieB, () => call('POST', `/notifications/${firstUnread.id}/read`))).status === 404);
  const mr = await call('POST', `/notifications/${firstUnread.id}/read`);
  check('marcar una como leída baja el contador', mr.status === 200 && mr.body.unread === listA.counts.unread - 1);
  check('/notifications/unread-count', (await call('GET', '/notifications/unread-count')).body.unread === mr.body.unread);
  check('grupo inválido => 400', (await call('GET', '/notifications?group=zzz')).status === 400);
  const pg1 = await call('GET', '/notifications?limit=2');
  check('paginación de notificaciones', pg1.body.notifications.length === 2 && pg1.body.nextCursor
    && !(await call('GET', `/notifications?limit=2&cursor=${pg1.body.nextCursor}`)).body.notifications.some((n) => pg1.body.notifications.some((m) => m.id === n.id)));
  check('marcar todas como leídas', (await call('POST', '/notifications/read-all')).body.unread === 0);

  // comentarios y respuestas
  const cm1 = await as(cookieC, () => call('POST', `/posts/${cat.id}/comments`, { json: { content: '¿Sigue ahí el gatito?' } }));
  check('comentar notifica al autor del post ("comment")', (await notifs(cookieA)).notifications.some((n) => n.type === 'comment' && n.post.id === cat.id && n.data.snippet.includes('gatito')));
  await call('POST', `/posts/${cat.id}/comments`, { json: { content: 'Sí, está dormido', parentId: cm1.body.comment.id } });
  check('responder notifica al autor del comentario ("reply")', (await notifs(cookieC)).notifications.some((n) => n.type === 'reply' && n.post.id === cat.id));
  const before = (await notifs(cookieA)).counts.unread;
  await call('POST', `/posts/${cat.id}/comments`, { json: { content: 'Comento en mi propio post' } });
  check('no te notificas a ti mismo', (await notifs(cookieA)).counts.unread === before);

  // preferencias + avisos por cercanía
  const st0 = await call('GET', '/notifications/settings');
  check('preferencias por defecto', st0.body.settings.nearby === true && st0.body.settings.radiusKm === 25 && st0.body.radii.includes(10));
  check('preferencias inválidas => 400', (await call('PUT', '/notifications/settings', { json: { radiusKm: 7 } })).status === 400
    && (await call('PUT', '/notifications/settings', { json: { nearby: 'si' } })).status === 400
    && (await call('PUT', '/notifications/settings', { json: {} })).status === 400);

  const setLoc = (c, lat, lng) => as(c, () => call('PUT', '/users/me/location', { json: { latitude: lat, longitude: lng } }));
  await setLoc(cookieB, 19.36, -99.15);   // ~1.4 km del animal
  await setLoc(cookieC, 41.38, 2.17);     // Barcelona: lejos
  await setLoc(cookieA, 19.35, -99.16);   // el autor también tiene ubicación
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const nearPost = await mk({ content: 'Perro callejero con herida en la pata', species: 'dog', type: 'found', location: JSON.stringify({ placeName: 'Mercado Coyoacán', latitude: 19.35, longitude: -99.16 }) });
  await wait(250);
  const nearN = (await notifs(cookieB)).notifications.find((n) => n.type === 'nearby_pet' && n.post?.id === nearPost.id);
  check('aviso de cercanía a quien tiene ubicación registrada cerca', !!nearN && nearN.data.distanceKm > 0 && nearN.data.distanceKm < 3 && nearN.data.species === 'dog' && nearN.data.placeName === 'Mercado Coyoacán', JSON.stringify(nearN));
  check('el aviso trae quién publicó y la publicación', nearN.actor.username === uname && nearN.post.snippet.startsWith('Perro callejero'));
  check('no avisa al autor', !(await notifs(cookieA)).notifications.some((n) => n.type === 'nearby_pet' && n.post?.id === nearPost.id));
  check('no avisa a quien está lejos (Barcelona)', !(await notifs(cookieC)).notifications.some((n) => n.type === 'nearby_pet'));
  check('grupo "nearby" solo trae avisos de cercanía', (await notifs(cookieB, '?group=nearby')).notifications.every((n) => n.type === 'nearby_pet')
    && (await notifs(cookieB, '?group=activity')).notifications.every((n) => n.type !== 'nearby_pet'));
  check('contadores por grupo', (await notifs(cookieB)).counts.nearby >= 1);

  await as(cookieB, () => call('PUT', '/notifications/settings', { json: { radiusKm: 5 } }));
  const farPost = await mk({ content: 'Gato perdido a 9 km', species: 'cat', type: 'lost', location: JSON.stringify({ placeName: 'Lejos', latitude: 19.43, longitude: -99.16 }) });
  await wait(250);
  check('respeta el radio elegido (5 km): un animal a ~9 km no avisa', !(await notifs(cookieB)).notifications.some((n) => n.post?.id === farPost.id));
  await as(cookieB, () => call('PUT', '/notifications/settings', { json: { radiusKm: 50 } }));
  const farPost2 = await mk({ content: 'Otro gato perdido a 9 km', species: 'cat', type: 'lost', location: JSON.stringify({ placeName: 'Lejos 2', latitude: 19.43, longitude: -99.16 }) });
  await wait(250);
  check('con radio 50 km sí avisa', (await notifs(cookieB)).notifications.some((n) => n.type === 'nearby_pet' && n.post?.id === farPost2.id));
  await as(cookieB, () => call('PUT', '/notifications/settings', { json: { nearby: false } }));
  const mutedPost = await mk({ content: 'Perro con collar rojo', species: 'dog', type: 'found', location: JSON.stringify({ placeName: 'Mercado Coyoacán', latitude: 19.35, longitude: -99.16 }) });
  await wait(250);
  check('con avisos desactivados no se notifica', !(await notifs(cookieB)).notifications.some((n) => n.post?.id === mutedPost.id));
  await as(cookieB, () => call('PUT', '/notifications/settings', { json: { nearby: true, radiusKm: 25 } }));
  const generalPost = await mk({ content: 'Consejos para cuidar mascotas', type: 'general', location: JSON.stringify({ placeName: 'Mercado Coyoacán', latitude: 19.35, longitude: -99.16 }) });
  const noLocPost = await mk({ content: 'Gatito sin ubicación' , type: 'found' });
  await wait(250);
  const nb = (await notifs(cookieB)).notifications;
  check('las publicaciones "general" o sin ubicación no generan aviso', !nb.some((n) => n.post?.id === generalPost.id || n.post?.id === noLocPost.id));
  check('el aviso de cercanía no se duplica', nb.filter((n) => n.post?.id === nearPost.id).length === 1);

  // ================= WebSocket (tiempo real) =================
  console.log('--- websocket ---');
  const WS = require('ws');
  const WS_URL = BASE.replace(/^http/, 'ws').replace(/\/api$/, '') + '/ws';
  const openWs = (c, origin = ORIGIN) => new Promise((resolve) => {
    const ws = new WS(WS_URL, { headers: { Cookie: c, Origin: origin } });
    ws.messages = [];
    ws.on('message', (m) => ws.messages.push(JSON.parse(m)));
    ws.on('open', () => resolve({ ok: true, ws }));
    ws.on('unexpected-response', (req, res) => resolve({ ok: false, status: res.statusCode }));
    ws.on('error', () => {});
  });
  const nextMsg = async (ws, type, ms = 2000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const m = ws.messages.find((x) => x.type === type); if (m) return m; await wait(25); }
    return null;
  };
  check('WS sin sesión => 401', (await openWs('')).status === 401);
  check('WS con origen no permitido => 403', (await openWs(cookieA, 'http://evil.com')).status === 403);
  const wsA = await openWs(cookieA);
  check('WS autenticado se conecta y envía "ready" con contadores', wsA.ok && (await nextMsg(wsA.ws, 'ready'))?.counts?.unread !== undefined);
  await as(cookieC, () => call('POST', `/posts/${cat.id}/comments`, { json: { content: 'Comentario en vivo' } }));
  const live = await nextMsg(wsA.ws, 'notification');
  check('notificación en tiempo real por WS (comment)', live?.notification?.type === 'comment' && live.notification.actor.username && live.counts.unread >= 1, JSON.stringify(live));
  const wsB = await openWs(cookieB);
  await nextMsg(wsB.ws, 'ready');
  const live2Post = await mk({ content: 'Perro perdido en tiempo real', species: 'dog', type: 'lost', location: JSON.stringify({ placeName: 'Mercado Coyoacán', latitude: 19.35, longitude: -99.16 }) });
  const live2 = await nextMsg(wsB.ws, 'notification');
  check('aviso de cercanía en tiempo real por WS', live2?.notification?.type === 'nearby_pet' && live2.notification.post.id === live2Post.id);
  check('usuarios no relacionados no reciben el mensaje', !wsA.ws.messages.some((m) => m.notification?.post?.id === live2Post.id));
  const extra = [];
  for (let i = 0; i < 4; i++) extra.push(await openWs(cookieA));
  check('máximo 5 conexiones por usuario (la 6ª => 429)', extra.every((x) => x.ok) && (await openWs(cookieA)).status === 429);
  for (const x of [wsA, wsB, ...extra]) x.ws?.terminate();
  check('un mensaje enviado por el cliente no rompe la conexión', await (async () => {
    const c = await openWs(cookieC); c.ws.send('hola'); await wait(100); const alive = c.ws.readyState === 1; c.ws.terminate(); return alive;
  })());

  // ================= Exportación a Google Sheets =================
  console.log('--- sheets ---');
  const http = require('http');
  const sheets = require('./src/modules/sheets-export').service;
  const received = [];
  let mode = 'ok';
  const mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, type: req.headers['content-type'], body: raw });
      if (mode === 'html') { res.setHeader('Content-Type', 'text/html'); return res.end('<html>Inicia sesión</html>'); }
      if (mode === '500') { res.statusCode = 500; return res.end('boom'); }
      if (mode === 'scripterr') return res.end(JSON.stringify({ status: 'error', message: 'API key inválida' }));
      res.end(JSON.stringify({ status: 'success', row: 12 }));
    });
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const mockUrl = `http://127.0.0.1:${mock.address().port}/macros/s/ABC/exec`;
  const cfg = { webhookUrl: mockUrl, apiKey: 'KEY-SECRETA-123', keyParam: 'api_key', keyIn: 'body' };
  const opt = { allowInsecure: true, retryDelayMs: 5 };

  const exp = await sheets.exportMetrics(cfg, opt);
  const sent = JSON.parse(received[0].body);
  check('envía POST JSON con los campos del script original + api_key', exp.ok && received[0].method === 'POST' && received[0].type === 'application/json'
    && Object.keys(sent).sort().join() === ['api_key', 'fecha_exportacion', 'publicaciones_hoy', 'total_publicaciones', 'total_usuarios'].sort().join(), JSON.stringify(sent));
  check('fecha_exportacion con formato YYYY-MM-DD HH:MM:SS', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(sent.fecha_exportacion));
  const dbm = sheets.buildMetrics();
  check('las métricas coinciden con la base de datos', sent.total_usuarios === dbm.total_usuarios && sent.total_publicaciones === dbm.total_publicaciones && sent.publicaciones_hoy === dbm.publicaciones_hoy && sent.publicaciones_hoy >= 1);
  check('la API key viaja en el cuerpo y NO se devuelve en el resultado', sent.api_key === 'KEY-SECRETA-123' && !JSON.stringify(exp).includes('KEY-SECRETA'));
  check('devuelve la respuesta del script', exp.body.status === 'success' && exp.body.row === 12);

  received.length = 0;
  await sheets.exportMetrics({ ...cfg, keyIn: 'query', keyParam: 'key' }, opt);
  check('modo query: key en la URL y no en el cuerpo', received[0].url.includes('key=KEY-SECRETA-123') && !received[0].body.includes('KEY-SECRETA'));

  mode = 'html';
  const rh = await sheets.exportMetrics(cfg, opt);
  check('respuesta HTML (Web App no pública) => error claro', rh.ok === false && /no es JSON/.test(rh.error));
  mode = 'scripterr';
  const rs = await sheets.exportMetrics(cfg, opt);
  check('error devuelto por el script => ok=false con mensaje', rs.ok === false && rs.error.includes('API key inválida'));
  mode = '500'; received.length = 0;
  const r5 = await sheets.exportMetrics(cfg, opt);
  check('error 5xx: reintenta 3 veces y falla sin lanzar', r5.ok === false && received.length === 3);
  await new Promise((r) => mock.close(r));
  const rn = await sheets.exportMetrics({ ...cfg, webhookUrl: 'http://127.0.0.1:1/exec' }, opt);
  check('servidor caído: error de red controlado', rn.ok === false && /error de red/.test(rn.error));
  const rejects = async (fn) => { try { await fn(); return false; } catch { return true; } };
  check('sin configurar => lanza error claro', await rejects(() => sheets.exportMetrics({ webhookUrl: '', apiKey: '' }, opt)));
  check('URL http o de otro dominio => rechazada (anti-SSRF)', await rejects(() => sheets.exportMetrics({ ...cfg, webhookUrl: 'http://script.google.com/macros/s/x/exec' }))
    && await rejects(() => sheets.exportMetrics({ ...cfg, webhookUrl: 'https://evil.example.com/exec' })));

  for (const x of [cat, rabbit, adopt, nearPost, farPost, farPost2, mutedPost, generalPost, noLocPost, live2Post]) await call('DELETE', `/posts/${x.id}`);

  cleanup([id, id2, id3]);
  console.log(failures ? `\n${failures} prueba(s) fallaron` : '\nTodo OK');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
