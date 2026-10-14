import jwt from 'jsonwebtoken';

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { message: 'Access token required', code: 'TOKEN_MISSING' } });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.userId, email: payload.email };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: { message: 'Invalid or expired token', code: 'TOKEN_INVALID' } });
  }
}