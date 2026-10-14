import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'AudioJob' },
  title: { type: String, required: true },
  outputType: { type: String, enum: ['flowchart', 'chatbot'], required: true },
  speakerCount: { type: Number, required: true },
  executiveSummary: String,
  tags: [String],
  visualData: { type: mongoose.Schema.Types.Mixed, required: true },
  transcript: String,
  segments: mongoose.Schema.Types.Mixed,
  summary: mongoose.Schema.Types.Mixed,
  speakers: mongoose.Schema.Types.Mixed,
  evaluation: mongoose.Schema.Types.Mixed,
  chatHistory: mongoose.Schema.Types.Mixed,
  isStarred: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'createdAt' } });

export const Report = mongoose.model('Report', reportSchema);