import { body, validationResult } from 'express-validator';

export const validateSignup = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('purpose').isIn(['Education', 'Enterprise']).withMessage('Purpose must be Education or Enterprise')
];

export const validateLogin = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

export const validateProfileUpdate = [
  body('fullName').trim().notEmpty().withMessage('Full name is required')
];

export function isPersonalEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  const personalDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
    'aol.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com', 'yandex.com', 'gmx.com'
  ];
  if (personalDomains.includes(domain)) return true;
  if (/(gmail|yahoo|hotmail|outlook|icloud|aol|proton|live|msn|yandex|gmx|mail\.com)/.test(domain)) return true;
  return false;
}

export function validateFileType(buffer) {
  const signatures = {
    'audio/mpeg': [0xFF, 0xFB],
    'audio/wav': [0x52, 0x49],
    'audio/mp4': [0x00, 0x00],
    'audio/ogg': [0x4F, 0x67],
    'audio/flac': [0x66, 0x4C],
    'audio/aac': [0x00, 0x00]
  };

  const extToMime = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac'
  };

  const extension = buffer.extension?.toLowerCase();
  if (!extension || !extToMime[extension]) return false;

  return true;
}