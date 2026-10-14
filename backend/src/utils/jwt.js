import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
  console.error('JWT_REFRESH_SECRET must be at least 32 characters');
  process.exit(1);
}

export function generateAccessToken(userId, email) {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(userId) {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}