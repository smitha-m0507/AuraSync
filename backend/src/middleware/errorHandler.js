export function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { message: `File exceeds the ${Number(process.env.MAX_FILE_SIZE_MB) || 1024} MB upload limit`, code: 'FILE_TOO_LARGE' } });
  }
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: { message: `File exceeds the ${Number(process.env.MAX_FILE_SIZE_MB) || 1024} MB upload limit`, code: 'FILE_TOO_LARGE' } });
  }

  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  
  res.status(status).json({
    success: false,
    error: { message, code: err.code || 'INTERNAL_ERROR' }
  });
}