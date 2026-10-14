import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { verifyToken } from '../middleware/auth.js';
import { runAgentPipeline, buildFlowchartForJob } from '../services/agentPipeline.js';
import { resolveTranscriptionProvider, checkUploadLimits } from '../services/transcriptionService.js';
import { answerQuestion } from '../services/agents/chatAgent.js';
import { AudioJob } from '../db/audiojob.model.js';
import { AUDIO_TYPE_IDS } from '../services/audioTypes.js';

const uploadDir = path.resolve('tmp', 'aurasync-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.webm', '.mp4', '.opus', '.mpeg', '.mpga'];
const OUTPUT_TYPES = ['flowchart', 'chatbot'];

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 1024) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error('Unsupported audio format'), false);
    }
    cb(null, true);
  }
});

const router = Router();
const flowchartsInProgress = new Set();

const notFound = (res) => res.status(404).json({ success: false, error: { message: 'Job not found', code: 'JOB_NOT_FOUND' } });
const badRequest = (res, message, code) => res.status(400).json({ success: false, error: { message, code } });

router.post('/upload', verifyToken, upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) return badRequest(res, 'Audio file required', 'NO_FILE');

    const { outputType } = req.body;
    const audioType = req.body.audioType || 'other';
    if (!OUTPUT_TYPES.includes(outputType)) {
      fs.promises.unlink(req.file.path).catch(() => {});
      return badRequest(res, `Invalid output type. Use one of: ${OUTPUT_TYPES.join(', ')}`, 'INVALID_OUTPUT_TYPE');
    }
    if (!AUDIO_TYPE_IDS.includes(audioType)) {
      fs.promises.unlink(req.file.path).catch(() => {});
      return badRequest(res, `Invalid audio type. Use one of: ${AUDIO_TYPE_IDS.join(', ')}`, 'INVALID_AUDIO_TYPE');
    }

    // Speaker count is optional: "auto"/empty lets the model infer it; a number is only a hint.
    const hint = parseInt(req.body.speakerCount, 10);
    const speakerHint = Number.isFinite(hint) && hint > 0 ? Math.min(hint, 20) : null;

    const extension = path.extname(req.file.originalname).replace('.', '').toLowerCase();
    const limitError = checkUploadLimits(resolveTranscriptionProvider(), extension, req.file.size);
    if (limitError) {
      fs.promises.unlink(req.file.path).catch(() => {});
      return badRequest(res, limitError, 'FILE_NOT_SUPPORTED');
    }

    const job = await AudioJob.create({
      userId: req.user.id,
      outputType,
      audioType,
      speakerHint,
      fileName: req.file.originalname,
      originalFileName: req.file.originalname,
      filePath: req.file.path,
      fileSizeBytes: req.file.size,
      status: 'pending'
    });

    const jobId = job._id.toString();
    runAgentPipeline(jobId, { outputType, speakerHint, audioType })
      .catch((error) => console.error('Pipeline failed:', error));

    res.json({ success: true, data: { jobId } });
  } catch (error) {
    next(error);
  }
});

// History: the user's analyses, newest first (lightweight fields only).
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const jobs = await AudioJob.find({ userId: req.user.id, outputType: { $in: OUTPUT_TYPES } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('originalFileName audioType outputType status progress errorMessage speakerCount durationSeconds agentSummary.title agentVisual.version evaluation.overall evaluation.valid chatHistory createdAt');

    res.json({
      success: true,
      data: {
        jobs: jobs.map((job) => ({
          jobId: job._id,
          fileName: job.originalFileName,
          title: job.agentSummary?.title || job.originalFileName,
          audioType: job.audioType,
          outputType: job.outputType,
          status: job.status,
          progress: job.progress,
          error: job.errorMessage,
          speakerCount: job.speakerCount,
          durationSeconds: job.durationSeconds,
          hasFlowchart: Boolean(job.agentVisual?.version),
          evaluationScore: job.evaluation?.overall ?? null,
          evaluationValid: job.evaluation?.valid ?? null,
          chatMessages: (job.chatHistory || []).filter((turn) => turn.role === 'user').length,
          createdAt: job.createdAt
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:jobId', verifyToken, async (req, res, next) => {
  try {
    const job = await AudioJob.findOne({ _id: req.params.jobId, userId: req.user.id }).select('status filePath');
    if (!job) return notFound(res);
    if (!['completed', 'failed'].includes(job.status)) {
      return badRequest(res, 'This analysis is still running; delete it after it finishes.', 'IN_PROGRESS');
    }
    await AudioJob.deleteOne({ _id: job._id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/:jobId/status', verifyToken, async (req, res, next) => {
  try {
    const job = await AudioJob.findOne({ _id: req.params.jobId, userId: req.user.id })
      .select('status progress errorMessage outputType speakerCount');
    if (!job) return notFound(res);

    res.json({
      success: true,
      data: {
        jobId: job._id,
        status: job.status,
        progress: job.progress,
        outputType: job.outputType,
        speakerCount: job.speakerCount,
        error: job.errorMessage
      }
    });
  } catch (error) {
    next(error);
  }
});

function serializeResult(job) {
  return {
    jobId: job._id,
    outputType: job.outputType,
    audioType: job.audioType,
    fileName: job.originalFileName,
    durationSeconds: job.durationSeconds,
    transcription: job.transcription,
    transcript: job.agentTranscript,
    segments: job.segments,
    speakers: job.speakers,
    speakerCount: job.speakerCount,
    diarization: job.agentDiarization,
    summary: job.agentSummary,
    flowchart: job.agentVisual,
    evaluation: job.evaluation,
    chatHistory: job.chatHistory || []
  };
}

router.get('/:jobId/result', verifyToken, async (req, res, next) => {
  try {
    const job = await AudioJob.findOne({ _id: req.params.jobId, userId: req.user.id });
    if (!job) return notFound(res);
    if (job.status !== 'completed') return badRequest(res, 'Job not completed', 'NOT_COMPLETED');

    res.json({ success: true, data: serializeResult(job) });
  } catch (error) {
    next(error);
  }
});

// Generate the concept tree for a job that was processed as a chatbot (or regenerate it with ?force=true).
router.post('/:jobId/flowchart', verifyToken, async (req, res, next) => {
  const { jobId } = req.params;
  try {
    const job = await AudioJob.findOne({ _id: jobId, userId: req.user.id });
    if (!job) return notFound(res);
    if (job.status !== 'completed') return badRequest(res, 'Job not completed', 'NOT_COMPLETED');
    if (!job.segments?.length || !job.knowledge) return badRequest(res, 'This job has no analysed transcript', 'NO_TRANSCRIPT');

    if (job.agentVisual?.version && req.query.force !== 'true') {
      return res.json({ success: true, data: { flowchart: job.agentVisual, evaluation: job.evaluation } });
    }
    if (flowchartsInProgress.has(jobId)) {
      return res.status(409).json({ success: false, error: { message: 'Flowchart is already being generated', code: 'IN_PROGRESS' } });
    }

    flowchartsInProgress.add(jobId);
    const { flowchart, evaluation } = await buildFlowchartForJob(job);
    res.json({ success: true, data: { flowchart, evaluation } });
  } catch (error) {
    next(error);
  } finally {
    flowchartsInProgress.delete(jobId);
  }
});

router.post('/:jobId/chat', verifyToken, async (req, res, next) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (!question) return badRequest(res, 'Question is required', 'NO_QUESTION');
    if (question.length > 2000) return badRequest(res, 'Question is too long (max 2000 characters)', 'QUESTION_TOO_LONG');

    const job = await AudioJob.findOne({ _id: req.params.jobId, userId: req.user.id });
    if (!job) return notFound(res);
    if (job.status !== 'completed') return badRequest(res, 'Job not completed', 'NOT_COMPLETED');

    const history = job.chatHistory || [];
    const { answer, contextMode, citations } = await answerQuestion(job, question, history);

    const now = new Date().toISOString();
    const userTurn = { role: 'user', content: question, createdAt: now };
    const assistantTurn = { role: 'assistant', content: answer, contextMode, citations, createdAt: new Date().toISOString() };
    await AudioJob.updateOne({ _id: job._id }, { $push: { chatHistory: { $each: [userTurn, assistantTurn] } } });

    res.json({ success: true, data: { message: assistantTurn } });
  } catch (error) {
    next(error);
  }
});

router.delete('/:jobId/chat', verifyToken, async (req, res, next) => {
  try {
    const result = await AudioJob.updateOne({ _id: req.params.jobId, userId: req.user.id }, { $set: { chatHistory: [] } });
    if (result.matchedCount === 0) return notFound(res);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
