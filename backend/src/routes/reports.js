import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { Report } from '../db/report.model.js';

const router = Router();
const REPORT_TYPES = ['flowchart', 'chatbot'];

router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, filter = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Only flowchart and chatbot reports exist; anything else is hidden.
    let query = { userId: req.user.id, outputType: { $in: REPORT_TYPES } };

    if (filter === 'starred') {
      query.isStarred = true;
    } else if (filter === 'flowchart') {
      query.outputType = 'flowchart';
    } else if (filter === 'chatbot') {
      query.outputType = 'chatbot';
    }

    const [reports, total] = await Promise.all([
      Report.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Report.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: {
        reports: reports.map(row => ({
          id: row._id,
          title: row.title,
          outputType: row.outputType,
          speakerCount: row.speakerCount,
          executiveSummary: row.executiveSummary,
          tags: row.tags,
          visualData: row.visualData,
          isStarred: row.isStarred,
          jobId: row.jobId,
          transcript: row.transcript,
          summary: row.summary,
          speakers: row.speakers,
          evaluation: row.evaluation,
          chatHistory: row.chatHistory,
          createdAt: row.createdAt
        })),
        pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages }
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const row = await Report.findOne({ _id: id, userId: req.user.id, outputType: { $in: REPORT_TYPES } });

    if (!row) {
      return res.status(404).json({ success: false, error: { message: 'Report not found', code: 'REPORT_NOT_FOUND' } });
    }

    res.json({
      success: true,
      data: {
        id: row._id,
        title: row.title,
        outputType: row.outputType,
        speakerCount: row.speakerCount,
        executiveSummary: row.executiveSummary,
        tags: row.tags,
        visualData: row.visualData,
        isStarred: row.isStarred,
        jobId: row.jobId,
        transcript: row.transcript,
        segments: row.segments,
        summary: row.summary,
        speakers: row.speakers,
        evaluation: row.evaluation,
        chatHistory: row.chatHistory,
        createdAt: row.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', verifyToken, async (req, res, next) => {
  try {
    const { jobId, title, outputType, speakerCount, executiveSummary, tags, visualData, transcript, segments, summary, speakers, evaluation, chatHistory } = req.body;

    if (!REPORT_TYPES.includes(outputType)) {
      return res.status(400).json({ success: false, error: { message: `outputType must be one of: ${REPORT_TYPES.join(', ')}`, code: 'INVALID_OUTPUT_TYPE' } });
    }
    if (!title || !visualData) {
      return res.status(400).json({ success: false, error: { message: 'Missing required fields', code: 'MISSING_FIELDS' } });
    }

    const row = await Report.create({
      userId: req.user.id,
      jobId,
      title,
      outputType,
      speakerCount: speakerCount || 1,
      executiveSummary,
      tags: tags || [],
      visualData,
      transcript,
      segments,
      summary,
      speakers,
      evaluation,
      chatHistory
    });

    res.json({
      success: true,
      data: {
        id: row._id,
        title: row.title,
        outputType: row.outputType,
        speakerCount: row.speakerCount,
        createdAt: row.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await Report.deleteOne({ _id: id, userId: req.user.id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: { message: 'Report not found', code: 'REPORT_NOT_FOUND' } });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/star', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const row = await Report.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { $set: { isStarred: undefined } },
      { new: true }
    );

    if (!row) {
      return res.status(404).json({ success: false, error: { message: 'Report not found', code: 'REPORT_NOT_FOUND' } });
    }

    // Toggle the star
    row.isStarred = !row.isStarred;
    await row.save();

    res.json({ success: true, data: { isStarred: row.isStarred } });
  } catch (error) {
    next(error);
  }
});

export default router;