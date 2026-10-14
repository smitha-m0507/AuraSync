import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { ffmpegAvailable, prepareAudioChunks } from './audioPrep.js';

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const ASSEMBLY_BASE_URL = 'https://api.assemblyai.com/v2';

const GROQ_FORMATS = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'opus', 'wav', 'webm'];
const MIME_TYPES = {
  mp3: 'audio/mpeg', mpeg: 'audio/mpeg', mpga: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  mp4: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/opus', flac: 'audio/flac', webm: 'audio/webm', aac: 'audio/aac'
};

/** Which transcription backend will handle the next upload. */
export function resolveTranscriptionProvider() {
  const wanted = config.transcription.provider;
  if (wanted === 'assemblyai' || (wanted === 'auto' && process.env.ASSEMBLYAI_API_KEY)) {
    if (!process.env.ASSEMBLYAI_API_KEY) throw new Error('TRANSCRIPTION_PROVIDER=assemblyai but ASSEMBLYAI_API_KEY is not set');
    return 'assemblyai';
  }
  if (!process.env.GROQ_API_KEY) throw new Error('No transcription provider configured: set GROQ_API_KEY or ASSEMBLYAI_API_KEY');
  return 'groq';
}

/** Validate an upload against the active provider's limits. Returns an error message or null. */
export function checkUploadLimits(provider, extension, sizeBytes) {
  // With ffmpeg every format is converted and long recordings are split, so length and size are not limited here.
  if (provider !== 'groq' || ffmpegAvailable) return null;
  if (!GROQ_FORMATS.includes(extension)) {
    return `.${extension} is not supported by Groq Whisper. Use ${GROQ_FORMATS.join(', ')}.`;
  }
  const maxBytes = config.transcription.groqMaxFileMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    return `File is ${(sizeBytes / 1048576).toFixed(1)} MB but ffmpeg is unavailable to split it; Groq Whisper accepts up to ${config.transcription.groqMaxFileMb} MB per request.`;
  }
  return null;
}

/**
 * Transcribe an audio file of any length into timestamped segments.
 * @returns {{provider, model, language, durationSeconds, segments: {id,start,end,text,speaker}[], acousticDiarization: boolean}}
 */
export async function transcribeAudio(filePath, originalFileName, { speakerHint, onProgress } = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }
  const extension = path.extname(originalFileName || filePath).replace('.', '').toLowerCase() || 'mp3';
  const provider = resolveTranscriptionProvider();

  const result = provider === 'assemblyai'
    ? await transcribeWithAssemblyAI(filePath, { speakerHint })
    : await transcribeWithGroq(filePath, originalFileName, extension, onProgress);

  if (result.segments.length === 0) {
    throw new Error('No speech was detected in the audio.');
  }
  return result;
}

async function transcribeWithGroq(filePath, originalFileName, extension, onProgress) {
  const model = config.transcription.groqModel;

  if (!ffmpegAvailable) {
    const limitError = checkUploadLimits('groq', extension, fs.statSync(filePath).size);
    if (limitError) throw new Error(limitError);
    const data = await transcribeGroqRequest(fs.readFileSync(filePath), path.basename(originalFileName || `audio.${extension}`), MIME_TYPES[extension]);
    const segments = cleanSegments(data.segments, 0);
    if (segments.length === 0 && data.text?.trim()) segments.push({ start: 0, end: Number(data.duration) || 0, text: data.text.trim(), speaker: null });
    return groqResult(model, data.language, Number(data.duration), segments);
  }

  onProgress?.('Preparing audio');
  const { dir, chunks } = await prepareAudioChunks(filePath);
  try {
    const segments = [];
    let language = null;
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      onProgress?.(chunks.length > 1 ? `Transcribing part ${index + 1} of ${chunks.length}` : 'Transcribing audio');
      const data = await transcribeGroqRequest(await fs.promises.readFile(chunk.path), `part_${index + 1}.mp3`, 'audio/mpeg');
      language = language || data.language || null;
      // Timestamps from each chunk are relative to that chunk; shift them onto the recording's timeline.
      segments.push(...cleanSegments(data.segments, chunk.offset));
    }
    const last = chunks.at(-1);
    return groqResult(model, language, last.offset + last.duration, collapseRepeats(segments));
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function groqResult(model, language, durationSeconds, segments) {
  return {
    provider: 'groq',
    model,
    language: language || config.transcription.language || null,
    durationSeconds: durationSeconds || (segments.at(-1)?.end ?? 0),
    segments: segments.map((segment, id) => ({ id, ...segment })),
    acousticDiarization: false
  };
}

async function transcribeGroqRequest(buffer, fileName, mimeType) {
  const send = () => {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType || 'audio/mpeg' }), fileName);
    form.append('model', config.transcription.groqModel);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('temperature', '0');
    if (config.transcription.language) form.append('language', config.transcription.language);
    return fetch(GROQ_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form
    });
  };

  // Long recordings can hit the provider's audio-seconds-per-hour quota; wait as long as it asks (capped).
  let response;
  for (let attempt = 0; attempt <= config.transcription.maxRetries; attempt++) {
    response = await send();
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) break;
    const retryAfter = Number(response.headers.get('retry-after')) || 2 ** (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, config.transcription.maxRetryWaitSeconds) * 1000));
  }
  if (!response.ok) {
    throw new Error(`Groq Whisper transcription failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

/**
 * Whisper's standard silence heuristic: a segment is non-speech when the model is confident there is
 * no speech AND the decoded text is low-probability, typically hallucinations on silence.
 */
function cleanSegments(rawSegments = [], offset = 0) {
  const { noSpeechThreshold, logprobThreshold } = config.transcription;
  return collapseRepeats((rawSegments || [])
    .filter((segment) => {
      const text = (segment.text || '').trim();
      if (!text) return false;
      return !((segment.no_speech_prob ?? 0) > noSpeechThreshold && (segment.avg_logprob ?? 0) < logprobThreshold);
    })
    .map((segment) => ({
      start: (Number(segment.start) || 0) + offset,
      end: (Number(segment.end) || 0) + offset,
      text: segment.text.trim(),
      speaker: null
    })));
}

/** Whisper can loop on the same sentence; merge consecutive identical segments into one. */
function collapseRepeats(segments) {
  const out = [];
  for (const segment of segments) {
    const previous = out.at(-1);
    if (previous && previous.text.toLowerCase() === segment.text.toLowerCase()) {
      previous.end = segment.end;
      continue;
    }
    out.push({ ...segment });
  }
  return out;
}

async function transcribeWithAssemblyAI(filePath, { speakerHint }) {
  const headers = { authorization: process.env.ASSEMBLYAI_API_KEY };

  const upload = await fetch(`${ASSEMBLY_BASE_URL}/upload`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/octet-stream' },
    body: fs.readFileSync(filePath)
  });
  if (!upload.ok) throw new Error(`AssemblyAI upload failed: ${upload.status} ${await upload.text()}`);
  const { upload_url: audioUrl } = await upload.json();

  const body = {
    audio_url: audioUrl,
    speaker_labels: true,
    punctuate: true,
    format_text: true,
    ...(config.transcription.language ? { language_code: config.transcription.language } : { language_detection: true }),
    ...(speakerHint ? { speakers_expected: speakerHint } : {})
  };
  const created = await fetch(`${ASSEMBLY_BASE_URL}/transcript`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!created.ok) throw new Error(`AssemblyAI request failed: ${created.status} ${await created.text()}`);
  const { id } = await created.json();

  const deadline = Date.now() + config.transcription.assemblyTimeoutMs;
  let transcript;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, config.transcription.assemblyPollMs));
    const poll = await fetch(`${ASSEMBLY_BASE_URL}/transcript/${id}`, { headers });
    transcript = await poll.json();
    if (transcript.status === 'completed') break;
    if (transcript.status === 'error') throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
  }
  if (transcript?.status !== 'completed') throw new Error('AssemblyAI transcription timed out');

  const segments = (transcript.utterances || []).map((utterance, index) => ({
    id: index,
    start: utterance.start / 1000,
    end: utterance.end / 1000,
    text: utterance.text.trim(),
    speaker: `S${speakerLetterToNumber(utterance.speaker)}`
  }));

  return {
    provider: 'assemblyai',
    model: transcript.speech_model || 'assemblyai',
    language: transcript.language_code || null,
    durationSeconds: Number(transcript.audio_duration) || (segments.at(-1)?.end ?? 0),
    segments,
    acousticDiarization: true
  };
}

function speakerLetterToNumber(label) {
  const code = String(label || 'A').toUpperCase().charCodeAt(0);
  return code >= 65 && code <= 90 ? code - 64 : label;
}
