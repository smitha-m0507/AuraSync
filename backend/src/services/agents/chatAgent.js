import { chat } from '../llm.js';
import { config } from '../../config.js';
import { BM25Index, chunkBySize, formatTimestamp } from '../nlp/text.js';
import { audioTypeProfile } from '../audioTypes.js';

const SYSTEM_PROMPT = `You are AuraSync's assistant for one specific audio recording. Answer the user's questions using ONLY
the recording context provided (overview, speakers and transcript excerpts with [mm:ss] timestamps).
- Cite the timestamps you rely on, e.g. "... [03:15]". Attribute statements to speakers by their labels.
- For summaries, cover the whole recording using the overview and key points, in chronological order.
- If the answer is not in the recording, say so plainly — never guess or use outside knowledge about the topic
  unless the user explicitly asks for general explanation, and then label it as not from the recording.
- Be concise and well structured; use short markdown lists when helpful.`;

export function formatSegmentLine(segment, speakerLabels) {
  return `[${formatTimestamp(segment.start)}] ${speakerLabels.get(segment.speaker) || segment.speaker}: ${segment.text}`;
}

/** Build the context block: whole transcript when it fits, otherwise BM25-retrieved windows. */
function buildContext(job, question, history) {
  const speakers = job.speakers || [];
  const speakerLabels = new Map(speakers.map((s) => [s.id, s.label]));
  const segments = job.segments || [];
  const lines = segments.map((segment) => formatSegmentLine(segment, speakerLabels));
  const fullText = lines.join('\n');

  const summary = job.agentSummary || {};
  const overview = [
    `TITLE: ${summary.title || ''}`,
    `RECORDING TYPE: ${audioTypeProfile(job.audioType).label}`,
    `DURATION: ${formatTimestamp(job.durationSeconds || 0)}`,
    `SPEAKERS (${speakers.length}): ${speakers.map((s) => `${s.label}${s.role ? ` (${s.role})` : ''} — ${s.talkTimePercent}% talk time`).join('; ')}`,
    `SUMMARY: ${summary.executiveSummary || ''}`,
    summary.keyPoints?.length ? `KEY POINTS:\n${summary.keyPoints.map((p) => `- ${p}`).join('\n')}` : ''
  ].filter(Boolean).join('\n');

  if (fullText.length <= config.chat.fullContextChars) {
    return { overview, excerpts: fullText, mode: 'full-transcript', citations: [] };
  }

  // Retrieval: index overlapping-free windows of consecutive segments; the query includes the
  // previous user turn so follow-ups ("what about the second one?") retrieve the right place.
  const windows = chunkBySize(segments.map((segment, index) => ({ segment, line: lines[index] })), config.chat.windowChars, (item) => item.line.length);
  const index = new BM25Index(windows.map((window) => window.map((item) => item.line).join('\n')));
  const previousUser = [...history].reverse().find((turn) => turn.role === 'user')?.content || '';
  const hits = index.search(`${question} ${previousUser}`, config.chat.topK);

  const selected = hits.map((hit) => hit.index).sort((a, b) => a - b);
  const excerpts = selected.length
    ? selected.map((i) => windows[i].map((item) => item.line).join('\n')).join('\n...\n')
    : '(no transcript passage matched the question lexically — rely on the overview)';

  return {
    overview,
    excerpts,
    mode: 'retrieval',
    citations: selected.map((i) => ({ start: windows[i][0].segment.start, end: windows[i].at(-1).segment.end }))
  };
}

export async function answerQuestion(job, question, history = []) {
  const recentHistory = history.slice(-config.chat.historyTurns * 2).map((turn) => ({
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    content: String(turn.content).slice(0, 2000)
  }));
  const context = buildContext(job, question, recentHistory);

  const contextMessage = [
    'RECORDING OVERVIEW:',
    context.overview,
    '',
    context.mode === 'full-transcript' ? 'FULL TRANSCRIPT:' : 'MOST RELEVANT TRANSCRIPT EXCERPTS:',
    context.excerpts
  ].join('\n');

  const answer = await chat({
    system: `${SYSTEM_PROMPT}\n\n${contextMessage}`,
    messages: [...recentHistory, { role: 'user', content: question }],
    maxTokens: 2500,
    temperature: 0.2
  });

  return { answer: answer.trim(), contextMode: context.mode, citations: context.citations };
}
