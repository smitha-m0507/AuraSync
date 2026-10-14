import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { validateProfileUpdate } from '../utils/validators.js';
import { validationResult } from 'express-validator';
import { User } from '../db/user.model.js';

const router = Router();

router.get('/profile', verifyToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found', code: 'USER_NOT_FOUND' } });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        purpose: user.purpose,
        isPro: user.isPro
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/profile', verifyToken, validateProfileUpdate, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { message: errors.array()[0].msg, code: 'VALIDATION_ERROR' } });
    }

    const { fullName } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { fullName, updatedAt: new Date() },
      { new: true }
    );

    res.json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        purpose: user.purpose,
        isPro: user.isPro
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/upgrade', verifyToken, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { isPro: true, updatedAt: new Date() },
      { new: true }
    );

    res.json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        purpose: user.purpose,
        isPro: user.isPro
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;