// Audio preparation for recordings of any length.
// ffmpeg (bundled via ffmpeg-static) converts any input format to 16 kHz mono MP3 — the rate speech models
// use — and splits it into fixed-length chunks so every request stays far below the provider's upload limit.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { config } from '../config.js';

export const ffmpegAvailable = Boolean(ffmpegPath) && fs.existsSync(ffmpegPath);

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', ...args], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

/** Duration in seconds, read from ffmpeg's input summary. */
export async function probeDuration(filePath) {
  const { stderr } = await runFfmpeg(['-i', filePath]);
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * Convert and split a recording.
 * @returns {{ dir: string, chunks: { path: string, offset: number, duration: number }[] }}
 */
export async function prepareAudioChunks(filePath) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aurasync-chunks-'));
  const { chunkSeconds, bitrate } = config.transcription;

  const { code, stderr } = await runFfmpeg([
    '-y', '-i', filePath,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', bitrate,
    '-f', 'segment', '-segment_time', String(chunkSeconds), '-reset_timestamps', '1',
    path.join(dir, 'chunk_%04d.mp3')
  ]);
  if (code !== 0) {
    await fs.promises.rm(dir, { recursive: true, force: true });
    const reason = stderr.trim().split('\n').slice(-2).join(' ');
    throw new Error(`Could not read the audio file (it may be corrupted or not an audio file): ${reason.slice(0, 200)}`);
  }

  const files = (await fs.promises.readdir(dir)).filter((name) => name.endsWith('.mp3')).sort();
  if (files.length === 0) {
    await fs.promises.rm(dir, { recursive: true, force: true });
    throw new Error('The audio file contains no audio stream.');
  }

  // Segments split on packet boundaries, so measure each one and accumulate exact offsets.
  const chunks = [];
  let offset = 0;
  for (const name of files) {
    const chunkPath = path.join(dir, name);
    const duration = (await probeDuration(chunkPath)) ?? chunkSeconds;
    chunks.push({ path: chunkPath, offset, duration });
    offset += duration;
  }
  return { dir, chunks };
}
