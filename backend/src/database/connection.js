const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { dataDir } = require('../config/env');
const { migrate } = require('./migrations');

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'rescuepets.db'));
// WAL: lecturas concurrentes mientras se escribe. busy_timeout evita "database is locked".
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');

migrate(db);

// Ejecuta fn dentro de una transacción (rollback si lanza).
db.transaction = (fn) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

module.exports = db;
