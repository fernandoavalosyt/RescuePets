const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const sharp = require('sharp');
const { uploadRoot } = require('../../config/env');
const { AppError } = require('../../shared/errors');

const ALLOWED = new Set(['jpeg', 'png', 'webp']);
const LIMIT_PIXELS = 40e6;

/**
 * Valida por contenido real (no por extensión ni mimetype del cliente), corrige la orientación,
 * limita a 1600px, ELIMINA metadatos EXIF (incluye GPS: privacidad) y guarda como WebP con nombre
 * aleatorio. Devuelve la URL relativa que se almacena en la BD.
 */
async function saveImage(buffer, folder = 'posts') {
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: LIMIT_PIXELS }).metadata();
  } catch {
    throw new AppError(400, 'Uno de los archivos no es una imagen válida.');
  }
  if (!ALLOWED.has(meta.format)) throw new AppError(400, 'Solo se permiten imágenes JPG, PNG o WebP.');

  const { data, info } = await sharp(buffer, { limitInputPixels: LIMIT_PIXELS })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const now = new Date();
  const sub = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const name = `${crypto.randomUUID()}.webp`;
  await fs.mkdir(path.join(uploadRoot, sub), { recursive: true });
  await fs.writeFile(path.join(uploadRoot, sub, name), data, { flag: 'wx' });

  return { url: `/uploads/${sub}/${name}`, mime: 'image/webp', width: info.width, height: info.height, size: data.length };
}

// Borra archivos por su URL relativa (huérfanos tras un error, o imágenes eliminadas).
async function removeFiles(urls) {
  await Promise.all(urls.map((u) => {
    const file = path.join(uploadRoot, u.replace(/^\/uploads\//, ''));
    // Defensa extra: solo dentro de uploadRoot
    return file.startsWith(uploadRoot + path.sep) ? fs.unlink(file).catch(() => {}) : null;
  }));
}

module.exports = { saveImage, removeFiles };
