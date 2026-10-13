// Error de dominio con código HTTP. Los servicios lo lanzan; el errorHandler lo traduce a JSON.
class AppError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const notFound = (what = 'Recurso') => new AppError(404, `${what} no encontrado.`);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...(err.fields && { fields: err.fields }) });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande.' });
  console.error(err);
  res.status(500).json({ error: 'Error interno.' });
}

module.exports = { AppError, notFound, errorHandler };
