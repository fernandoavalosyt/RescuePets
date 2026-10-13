const multer = require('multer');
const { AppError } = require('../../shared/errors');

const MAX_FILES = 4;
const MAX_BYTES = 5 * 1024 * 1024;

// En memoria: nada llega a disco hasta que sharp valida y re-codifica la imagen.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_FILES, fields: 10, fieldSize: 8 * 1024 },
}).array('images', MAX_FILES);

const ERRORS = {
  LIMIT_FILE_SIZE: [413, 'Cada imagen debe pesar menos de 5 MB.'],
  LIMIT_FILE_COUNT: [400, `Máximo ${MAX_FILES} imágenes por publicación.`],
  LIMIT_UNEXPECTED_FILE: [400, `Máximo ${MAX_FILES} imágenes, en el campo "images".`],
};

// Procesa multipart (campo "images" + campos de texto) y traduce errores de multer a AppError.
function parseUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    const [status, message] = ERRORS[err.code] ?? [400, 'Solicitud multipart no válida.'];
    next(new AppError(status, message));
  });
}

module.exports = { parseUpload, MAX_FILES };
