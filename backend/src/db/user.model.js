import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  purpose: { type: String, enum: ['Education', 'Enterprise'], required: true },
  isPro: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

export const User = mongoose.model('User', userSchema);