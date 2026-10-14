import { chatJSON } from '../llm.js';
import { audioTypeProfile } from '../audioTypes.js';

const SYSTEM_PROMPT = `You write the executive overview of an audio recording from structured analyst notes that cover the
whole recording in chronological order. Use only information in the notes; never add facts.

Return ONE JSON object:
{
  "title": "specific title, max 8 words",
  "coreConcept": "the single central subject of the recording, 2-6 words",
  "recordingType": "e.g. meeting, interview, lecture, podcast, sales call, voice note",
  "executiveSummary": "4-6 sentence summary covering purpose, main points, outcomes",
  "keyPoints": ["5-8 short bullet points in the order they occur"],
  "tags": ["3-6 lowercase keyword tags"]
}`;

export async function synthesizeSummary(digest, { audioType } = {}) {
  const profile = audioTypeProfile(audioType);
  const summary = await chatJSON({
    system: `${SYSTEM_PROMPT}

RECORDING TYPE: ${profile.label}. ${profile.summary}`,
    messages: [{ role: 'user', content: `ANALYST NOTES:\n${digest}` }],
    maxTokens: 2500,
    temperature: 0.2
  }, 'summary');

  return {
    title: summary.title || summary.coreConcept || 'Audio analysis',
    coreConcept: summary.coreConcept || summary.title || '',
    recordingType: summary.recordingType || null,
    executiveSummary: summary.executiveSummary || '',
    keyPoints: Array.isArray(summary.keyPoints) ? summary.keyPoints : [],
    tags: Array.isArray(summary.tags) ? summary.tags : []
  };
}
