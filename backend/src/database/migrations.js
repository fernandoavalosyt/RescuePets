// Migraciones versionadas (PRAGMA user_version). Para cambiar el esquema NUNCA edites una
// migración ya aplicada: agrega una nueva al final del arreglo (ej. shares, follows, notificaciones).
const crypto = require('crypto');

const tableCols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

function legacyUsername() {
  return 'user_' + crypto.randomBytes(5).toString('hex');
}

const migrations = [
  // ---------- v1: usuarios, sesiones, ubicaciones, publicaciones, media, reacciones, comentarios ----------
  (db) => {
    // El prototipo anterior tenía users(identifier, identifier_type...). Se conserva y se migra.
    let legacy = [];
    if (tableCols(db, 'users').includes('identifier')) {
      legacy = db.prepare('SELECT * FROM users').all();
      db.exec('DROP TABLE IF EXISTS sessions; DROP TABLE users;');
    }

    db.exec(`
      CREATE TABLE users (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        username        TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(username) BETWEEN 3 AND 30),
        email           TEXT UNIQUE,
        phone           TEXT UNIQUE,
        display_name    TEXT NOT NULL,
        password_hash   TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','banned')),
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until    INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        CHECK (email IS NOT NULL OR phone IS NOT NULL)
      );

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_user    ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE locations (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        place_name TEXT NOT NULL,
        address    TEXT,
        city       TEXT,
        country    TEXT,
        latitude   REAL CHECK (latitude  BETWEEN -90  AND 90),
        longitude  REAL CHECK (longitude BETWEEN -180 AND 180),
        created_at INTEGER NOT NULL,
        CHECK ((latitude IS NULL) = (longitude IS NULL))
      );
      CREATE INDEX idx_locations_city ON locations(city);
      CREATE INDEX idx_locations_geo  ON locations(latitude, longitude) WHERE latitude IS NOT NULL;

      CREATE TABLE posts (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
        location_id   INTEGER          REFERENCES locations(id) ON DELETE SET NULL,
        content       TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
        post_type     TEXT NOT NULL DEFAULT 'found' CHECK (post_type IN ('found','lost','adoption','general')),
        pet_species   TEXT CHECK (pet_species IN ('dog','cat','other')),
        status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','resolved','deleted')),
        -- Contadores denormalizados: el feed no necesita COUNT(*) por cada post
        like_count    INTEGER NOT NULL DEFAULT 0,
        comment_count INTEGER NOT NULL DEFAULT 0,
        share_count   INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        deleted_at    INTEGER
      );
      -- Feed global paginado por cursor (created_at, id)
      CREATE INDEX idx_posts_feed     ON posts(status, created_at DESC, id DESC);
      CREATE INDEX idx_posts_user     ON posts(user_id, created_at DESC);
      CREATE INDEX idx_posts_location ON posts(location_id) WHERE location_id IS NOT NULL;
      CREATE INDEX idx_posts_type     ON posts(post_type, status, created_at DESC);

      -- Las imágenes viven en disco (backend/uploads); aquí solo se guarda su URL relativa.
      CREATE TABLE post_media (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        url        TEXT NOT NULL UNIQUE,
        mime_type  TEXT NOT NULL,
        width      INTEGER,
        height     INTEGER,
        size_bytes INTEGER NOT NULL,
        position   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_media_post ON post_media(post_id, position);

      -- Estructura lista para "me gusta"/reacciones (aún sin endpoints)
      CREATE TABLE post_reactions (
        post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type       TEXT NOT NULL DEFAULT 'like' CHECK (type IN ('like','love','care')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (post_id, user_id)
      ) WITHOUT ROWID;
      CREATE INDEX idx_reactions_user ON post_reactions(user_id, created_at DESC);

      -- Estructura lista para comentarios con respuestas anidadas (aún sin endpoints)
      CREATE TABLE comments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id    INTEGER NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
        user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
        parent_id  INTEGER          REFERENCES comments(id) ON DELETE CASCADE,
        content    TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
        status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','deleted')),
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_comments_post ON comments(post_id, created_at);
      CREATE INDEX idx_comments_user ON comments(user_id);

      CREATE TRIGGER trg_reaction_add AFTER INSERT ON post_reactions
        BEGIN UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id; END;
      CREATE TRIGGER trg_reaction_del AFTER DELETE ON post_reactions
        BEGIN UPDATE posts SET like_count = like_count - 1 WHERE id = OLD.post_id; END;
      CREATE TRIGGER trg_comment_add AFTER INSERT ON comments
        BEGIN UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id; END;
      CREATE TRIGGER trg_comment_del AFTER DELETE ON comments
        BEGIN UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id; END;

      -- Vista de exportación para Google Sheets
      CREATE VIEW vista_google_sheets AS
        SELECT p.id                                             AS id_publicacion,
               u.username                                       AS username,
               p.content                                        AS contenido,
               datetime(p.created_at / 1000, 'unixepoch')       AS fecha,
               l.place_name                                     AS nombre_ubicacion
        FROM posts p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN locations l ON l.id = p.location_id
        WHERE p.status = 'active'
        ORDER BY p.created_at DESC;
    `);

    const ins = db.prepare(`INSERT INTO users
      (username, email, phone, display_name, password_hash, failed_attempts, locked_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`);
    for (const u of legacy) {
      const name = legacyUsername();
      ins.run(name, u.identifier_type === 'email' ? u.identifier : null,
        u.identifier_type === 'phone' ? u.identifier : null, name, u.password_hash, u.created_at, u.created_at);
    }
  },

  // ---------- v2: username elegido por el usuario + índices de limpieza/comentarios ----------
  (db) => {
    db.exec(`
      ALTER TABLE users ADD COLUMN username_set INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX idx_posts_deleted   ON posts(deleted_at) WHERE status = 'deleted';
      CREATE INDEX idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
    `);
  },

  // ---------- v3: ubicación registrada del usuario (privada, solo la ve su dueño) ----------
  (db) => {
    db.exec(`
      ALTER TABLE users ADD COLUMN home_latitude  REAL CHECK (home_latitude  BETWEEN -90  AND 90);
      ALTER TABLE users ADD COLUMN home_longitude REAL CHECK (home_longitude BETWEEN -180 AND 180);
      ALTER TABLE users ADD COLUMN home_location_at INTEGER;
    `);
  },

  // ---------- v4: estado "rescued" + tablas de rescates (logros) ----------
  // SQLite no permite modificar un CHECK: se reconstruye `posts` (procedimiento oficial de 12 pasos,
  // con foreign_keys=OFF fuera de la transacción; ver disableFk en migrate()).
  Object.assign((db) => {
    db.exec(`
      DROP VIEW IF EXISTS vista_google_sheets;
      DROP TRIGGER IF EXISTS trg_reaction_add;
      DROP TRIGGER IF EXISTS trg_reaction_del;
      DROP TRIGGER IF EXISTS trg_comment_add;
      DROP TRIGGER IF EXISTS trg_comment_del;

      CREATE TABLE posts_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
        location_id   INTEGER          REFERENCES locations(id) ON DELETE SET NULL,
        content       TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
        post_type     TEXT NOT NULL DEFAULT 'found' CHECK (post_type IN ('found','lost','adoption','general')),
        pet_species   TEXT CHECK (pet_species IN ('dog','cat','other')),
        status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','resolved','rescued','deleted')),
        like_count    INTEGER NOT NULL DEFAULT 0,
        comment_count INTEGER NOT NULL DEFAULT 0,
        share_count   INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        deleted_at    INTEGER
      );
      INSERT INTO posts_new (id, user_id, location_id, content, post_type, pet_species, status, like_count,
                             comment_count, share_count, created_at, updated_at, deleted_at)
        SELECT id, user_id, location_id, content, post_type, pet_species, status, like_count,
               comment_count, share_count, created_at, updated_at, deleted_at FROM posts;
      DROP TABLE posts;
      ALTER TABLE posts_new RENAME TO posts;

      CREATE INDEX idx_posts_feed     ON posts(status, created_at DESC, id DESC);
      CREATE INDEX idx_posts_user     ON posts(user_id, created_at DESC);
      CREATE INDEX idx_posts_location ON posts(location_id) WHERE location_id IS NOT NULL;
      CREATE INDEX idx_posts_type     ON posts(post_type, status, created_at DESC);
      CREATE INDEX idx_posts_deleted  ON posts(deleted_at) WHERE status = 'deleted';

      CREATE TRIGGER trg_reaction_add AFTER INSERT ON post_reactions
        BEGIN UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id; END;
      CREATE TRIGGER trg_reaction_del AFTER DELETE ON post_reactions
        BEGIN UPDATE posts SET like_count = like_count - 1 WHERE id = OLD.post_id; END;
      CREATE TRIGGER trg_comment_add AFTER INSERT ON comments
        BEGIN UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id; END;
      CREATE TRIGGER trg_comment_del AFTER DELETE ON comments
        BEGIN UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id; END;

      CREATE VIEW vista_google_sheets AS
        SELECT p.id                                       AS id_publicacion,
               u.username                                 AS username,
               p.content                                  AS contenido,
               datetime(p.created_at / 1000, 'unixepoch') AS fecha,
               l.place_name                               AS nombre_ubicacion
        FROM posts p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN locations l ON l.id = p.location_id
        WHERE p.status = 'active'
        ORDER BY p.created_at DESC;

      -- Un rescate verificado por publicación: quién la rescató, su descripción y sus fotos de verificación
      CREATE TABLE rescues (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id    INTEGER NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
        rescuer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note       TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 1000),
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_rescues_recent  ON rescues(created_at DESC, id DESC);
      CREATE INDEX idx_rescues_rescuer ON rescues(rescuer_id, created_at DESC);

      CREATE TABLE rescue_media (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        rescue_id  INTEGER NOT NULL REFERENCES rescues(id) ON DELETE CASCADE,
        url        TEXT NOT NULL UNIQUE,
        mime_type  TEXT NOT NULL,
        width      INTEGER,
        height     INTEGER,
        size_bytes INTEGER NOT NULL,
        position   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_rescue_media ON rescue_media(rescue_id, position);
    `);
  }, { disableFk: true }),

  // ---------- v5: búsqueda de texto completo (FTS5, sin acentos, por prefijo) ----------
  (db) => {
    // Índice propio (rowid = id de la publicación). "tags" aporta sinónimos de especie y tipo, para que
    // buscar "perro" encuentre publicaciones marcadas como perro aunque el texto diga "cachorro".
    const tags = (p) => `(CASE ${p}.pet_species
        WHEN 'dog'   THEN 'perro perra perrito perrita cachorro can dog'
        WHEN 'cat'   THEN 'gato gata gatito gatita felino minino cat'
        WHEN 'other' THEN 'otro otra'
        ELSE '' END) || ' ' || (CASE ${p}.post_type
        WHEN 'found'    THEN 'encontrado encontrada'
        WHEN 'lost'     THEN 'perdido perdida extraviado'
        WHEN 'adoption' THEN 'adopcion adoptar'
        ELSE '' END)`;
    const place = (l) => `COALESCE(${l}.place_name, '') || ' ' || COALESCE(${l}.address, '') || ' ' || COALESCE(${l}.city, '')`;

    db.exec(`
      CREATE VIRTUAL TABLE posts_search USING fts5(content, place, tags, tokenize = 'unicode61 remove_diacritics 2');

      INSERT INTO posts_search (rowid, content, place, tags)
        SELECT p.id, p.content, COALESCE((SELECT ${place('l')} FROM locations l WHERE l.id = p.location_id), ''), ${tags('p')}
        FROM posts p;

      CREATE TRIGGER trg_search_post_ins AFTER INSERT ON posts BEGIN
        INSERT INTO posts_search (rowid, content, place, tags)
        VALUES (NEW.id, NEW.content,
                COALESCE((SELECT ${place('l')} FROM locations l WHERE l.id = NEW.location_id), ''), ${tags('NEW')});
      END;

      CREATE TRIGGER trg_search_post_upd AFTER UPDATE OF content, pet_species, post_type, location_id ON posts BEGIN
        DELETE FROM posts_search WHERE rowid = OLD.id;
        INSERT INTO posts_search (rowid, content, place, tags)
        VALUES (NEW.id, NEW.content,
                COALESCE((SELECT ${place('l')} FROM locations l WHERE l.id = NEW.location_id), ''), ${tags('NEW')});
      END;

      CREATE TRIGGER trg_search_post_del AFTER DELETE ON posts BEGIN
        DELETE FROM posts_search WHERE rowid = OLD.id;
      END;

      CREATE TRIGGER trg_search_loc_upd AFTER UPDATE ON locations BEGIN
        DELETE FROM posts_search WHERE rowid IN (SELECT id FROM posts WHERE location_id = NEW.id);
        INSERT INTO posts_search (rowid, content, place, tags)
          SELECT p.id, p.content, ${place('NEW')}, ${tags('p')} FROM posts p WHERE p.location_id = NEW.id;
      END;
    `);
  },

  // ---------- v6: rescates con aprobación del autor + notificaciones ----------
  // `rescues` se reconstruye para (a) agregar estado pending/approved/rejected y (b) permitir historial de
  // rechazos: la unicidad pasa a un índice parcial (solo un rescate "abierto" por publicación).
  Object.assign((db) => {
    db.exec(`
      CREATE TABLE rescues_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id       INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        rescuer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note          TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 1000),
        status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        decision_note TEXT,
        decided_at    INTEGER,
        created_at    INTEGER NOT NULL
      );
      -- Los rescates anteriores ya estaban "confirmados": quedan aprobados
      INSERT INTO rescues_new (id, post_id, rescuer_id, note, status, decided_at, created_at)
        SELECT id, post_id, rescuer_id, note, 'approved', created_at, created_at FROM rescues;
      DROP TABLE rescues;
      ALTER TABLE rescues_new RENAME TO rescues;

      CREATE UNIQUE INDEX idx_rescues_open     ON rescues(post_id) WHERE status IN ('pending','approved');
      CREATE INDEX        idx_rescues_recent   ON rescues(decided_at DESC, id DESC) WHERE status = 'approved';
      CREATE INDEX        idx_rescues_rescuer  ON rescues(rescuer_id, created_at DESC);
      CREATE INDEX        idx_rescues_pending  ON rescues(created_at) WHERE status = 'pending';
      CREATE INDEX        idx_rescues_post     ON rescues(post_id);

      -- Preferencias de avisos por cercanía
      ALTER TABLE users ADD COLUMN notify_nearby    INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE users ADD COLUMN notify_radius_km INTEGER NOT NULL DEFAULT 25 CHECK (notify_radius_km BETWEEN 1 AND 50);
      CREATE INDEX idx_users_home ON users(home_latitude, home_longitude) WHERE home_latitude IS NOT NULL;

      -- Notificaciones (data = JSON con los detalles propios de cada tipo)
      CREATE TABLE notifications (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        actor_id   INTEGER          REFERENCES users(id) ON DELETE SET NULL,
        post_id    INTEGER          REFERENCES posts(id) ON DELETE CASCADE,
        data       TEXT,
        read_at    INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_notif_user   ON notifications(user_id, created_at DESC, id DESC);
      CREATE INDEX idx_notif_unread ON notifications(user_id) WHERE read_at IS NULL;
      CREATE INDEX idx_notif_post   ON notifications(post_id) WHERE post_id IS NOT NULL;
      -- Un aviso de cercanía por usuario y publicación
      CREATE UNIQUE INDEX idx_notif_nearby_once ON notifications(user_id, post_id) WHERE type = 'nearby_pet';
    `);
  }, { disableFk: true }),

  // v7: suscripciones Web Push (una por dispositivo/navegador)
  (db) => {
    db.exec(`
      CREATE TABLE push_subscriptions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint   TEXT NOT NULL UNIQUE,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        user_agent TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_push_user ON push_subscriptions(user_id, created_at);
    `);
  },
];

function migrate(db, target = migrations.length) {
  let version = db.prepare('PRAGMA user_version').get().user_version;
  for (; version < target; version++) {
    const fn = migrations[version];
    // Reconstruir tablas exige foreign_keys=OFF, y ese PRAGMA solo actúa fuera de una transacción.
    if (fn.disableFk) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      fn(db);
      if (fn.disableFk) {
        const broken = db.prepare('PRAGMA foreign_key_check').all();
        if (broken.length) throw new Error(`Migración ${version + 1}: ${broken.length} violaciones de claves foráneas`);
      }
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      if (fn.disableFk) db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

module.exports = { migrate };
