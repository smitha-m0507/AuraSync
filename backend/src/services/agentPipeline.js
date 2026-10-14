import fs from 'fs';
import { AudioJob } from '../db/audiojob.model.js';
import { config } from '../config.js';
import { transcribeAudio } from './transcriptionService.js';
import { understandTranscript, remapKnowledgeSpeakers, buildKnowledgeDigest } from './agents/understandingAgent.js';
import { synthesizeSummary } from './agents/synthesisAgent.js';
import { generateFlowchart } from './agents/flowchartAgent.js';
import { formatSegmentLine } from './agents/chatAgent.js';

function reportProgress(jobId, progress, status) {
  // Atomic update so progress messages never race with the document saves below.
  AudioJob.updateOne({ _id: jobId }, { $set: { progress, ...(status ? { status } : {}) } })
    .catch((error) => console.error('Progress update failed:', error.message));
}

export function formattedTranscript(job) {
  const labels = new Map((job.speakers || []).map((s) => [s.id, s.label]));
  return (job.segments || []).map((segment) => formatSegmentLine(segment, labels)).join('\n');
}

/**
 * Upload pipeline: transcribe → speaker attribution + knowledge extraction → summary → (flowchart + evaluation).
 * The chatbot needs no extra precomputation beyond the transcript, speakers and summary.
 */
export async function runAgentPipeline(jobId, { outputType, speakerHint, audioType }) {
  const job = await AudioJob.findById(jobId);
  if (!job) throw new Error('Job not found');

  const setStatus = async (status, progress) => {
    job.status = status;
    job.progress = progress;
    await job.save();
  };

  try {
    await setStatus('transcribing', 'Transcribing audio');
    const transcription = await transcribeAudio(job.filePath, job.originalFileName || job.fileName, {
      speakerHint,
      onProgress: (message) => reportProgress(jobId, message)
    });
    job.durationSeconds = transcription.durationSeconds;
    job.transcription = {
      provider: transcription.provider,
      model: transcription.model,
      language: transcription.language,
      acousticDiarization: transcription.acousticDiarization,
      segmentCount: transcription.segments.length
    };
    job.segments = transcription.segments;
    job.agentTranscript = transcription.segments.map((s) => s.text).join(' ');
    await setStatus('analyzing', transcription.acousticDiarization
      ? 'Extracting key information'
      : 'Identifying speakers and extracting key information');

    const understanding = await understandTranscript(transcription, {
      speakerHint,
      audioType,
      onProgress: (message) => reportProgress(jobId, message)
    });
    job.segments = understanding.segments;
    job.knowledge = remapKnowledgeSpeakers(understanding.knowledge, understanding.speakers);
    job.speakers = understanding.speakers.map(({ originalId, ...speaker }) => speaker);
    job.speakerCount = job.speakers.length;
    job.agentTranscript = formattedTranscript(job);
    job.agentDiarization = {
      method: transcription.acousticDiarization ? 'acoustic' : 'linguistic',
      speakerCount: job.speakers.length,
      speakers: job.speakers
    };

    await setStatus('summarizing', 'Writing summary');
    const digest = buildKnowledgeDigest(job.knowledge, job.speakers);
    job.agentSummary = await synthesizeSummary(digest, { audioType });
    await job.save();

    if (outputType === 'flowchart') {
      await setStatus('visualizing', 'Building concept tree');
      await buildFlowchartForJob(job, { trackStatus: true });
    }

    job.completedAt = new Date();
    await setStatus('completed', null);
  } catch (error) {
    console.error('Pipeline error for job', jobId, error);
    job.errorMessage = error.message;
    await setStatus('failed', null).catch(() => {});
  } finally {
    // The audio is no longer needed once transcribed; don't keep user recordings on disk.
    if (job.filePath) fs.promises.unlink(job.filePath).catch(() => {});
  }
}

/** Generate (or regenerate) the evaluated concept tree for a job that already has a transcript. */
export async function buildFlowchartForJob(job, { trackStatus = false } = {}) {
  const speakers = job.speakers || [];
  const digest = buildKnowledgeDigest(job.knowledge, speakers);
  const transcriptLines = formattedTranscript(job);
  // Give the judge the real transcript when it fits; otherwise the chronological notes that cover all of it.
  const judgeSource = transcriptLines.length <= config.evaluation.judgeContextChars ? transcriptLines : digest;

  const { flowchart, evaluation } = await generateFlowchart({
    digest,
    summary: job.agentSummary,
    speakers,
    transcript: (job.segments || []).map((s) => s.text).join(' '),
    judgeSource,
    audioType: job.audioType,
    onProgress: (message, stage) => reportProgress(job._id, message, trackStatus ? stage : undefined)
  });

  job.agentVisual = flowchart;
  job.evaluation = evaluation;
  await job.save();
  return { flowchart, evaluation };
}
