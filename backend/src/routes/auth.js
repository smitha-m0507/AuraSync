import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../db/user.model.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { validateSignup, validateLogin, isPersonalEmail } from '../utils/validators.js';
import { validationResult } from 'express-validator';

const router = Router();

router.post('/signup', validateSignup, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: errors.array()[0].msg, code: 'VALIDATION_ERROR' } });
    }

    const { fullName, email, password, purpose } = req.body;

    if (isPersonalEmail(email)) {
      return res.status(400).json({ success: false, error: { message: 'Personal email domains are not allowed', code: 'PERSONAL_EMAIL' } });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, error: { message: 'Email already registered', code: 'EMAIL_EXISTS' } });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({ fullName, email, passwordHash, purpose });
    res.json({ success: true, data: { user: { id: user._id, fullName: user.fullName, email: user.email, purpose: user.purpose } } });
  } catch (error) {
    next(error);
  }
});

router.post('/login', validateLogin, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: errors.array()[0].msg, code: 'VALIDATION_ERROR' } });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' } });
    }

    const accessToken = generateAccessToken(user._id, user.email);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    res.json({
      success: true,
      data: {
        accessToken,
        user: { id: user._id, fullName: user.fullName, email: user.email, purpose: user.purpose, isPro: user.isPro }
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: { message: 'Refresh token required', code: 'NO_REFRESH_TOKEN' } });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({ success: false, error: { message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' } });
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: { message: 'User not found', code: 'USER_NOT_FOUND' } });
    }

    const newAccessToken = generateAccessToken(user._id, user.email);

    res.json({
      success: true,
      data: { accessToken: newAccessToken, user: { id: user._id, fullName: user.fullName, email: user.email, purpose: user.purpose, isPro: user.isPro } }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    res.clearCookie('refreshToken');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: { message: 'Access token required', code: 'TOKEN_MISSING' } });
    }

    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findById(payload.userId);
      if (!user) {
        return res.status(404).json({ success: false, error: { message: 'User not found', code: 'USER_NOT_FOUND' } });
      }

      res.json({
        success: true,
        data: {
          user: { id: user._id, fullName: user.fullName, email: user.email, purpose: user.purpose, isPro: user.isPro },
          accessToken: token
        }
      });
    } catch (error) {
      return res.status(401).json({ success: false, error: { message: 'Invalid token', code: 'TOKEN_INVALID' } });
    }
  } catch (error) {
    next(error);
  }
});

export default router;