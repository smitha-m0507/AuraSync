import mongoose from 'mongoose';

const audioJobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  outputType: { type: String, enum: ['flowchart', 'chatbot'], required: true },
  audioType: { type: String, enum: ['interview', 'meeting', 'discussion', 'conversation', 'other'], default: 'other' },
  speakerHint: { type: Number, default: null },
  speakerCount: { type: Number, default: 0 },
  fileName: String,
  originalFileName: String,
  filePath: String,
  fileSizeBytes: Number,
  durationSeconds: Number,
  status: {
    type: String,
    enum: ['pending', 'transcribing', 'diarizing', 'analyzing', 'summarizing', 'visualizing', 'evaluating', 'completed', 'failed'],
    default: 'pending'
  },
  progress: String,
  transcription: mongoose.Schema.Types.Mixed,
  segments: mongoose.Schema.Types.Mixed,
  speakers: mongoose.Schema.Types.Mixed,
  knowledge: mongoose.Schema.Types.Mixed,
  agentTranscript: String,
  agentDiarization: mongoose.Schema.Types.Mixed,
  agentAnalysis: mongoose.Schema.Types.Mixed,
  agentVisual: mongoose.Schema.Types.Mixed,
  agentSummary: mongoose.Schema.Types.Mixed,
  evaluation: mongoose.Schema.Types.Mixed,
  chatHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  errorMessage: String,
  completedAt: Date
}, { timestamps: { createdAt: 'createdAt' } });

export const AudioJob = mongoose.model('AudioJob', audioJobSchema);
