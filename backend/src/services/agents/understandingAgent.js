import { chatJSON } from '../llm.js';
import { config } from '../../config.js';
import { chunkBySize, formatTimestamp, contentStems } from '../nlp/text.js';
import { audioTypeProfile } from '../audioTypes.js';

const SYSTEM_PROMPT = `You are an expert conversation analyst working on an automatically transcribed audio recording.
You receive one chunk of the transcript as numbered segments. Each line looks like:
  [#<segment> <mm:ss> gap=<seconds of silence before it>] <text>
or, when speakers were already identified acoustically:
  [#<segment> <mm:ss> <speakerId>] <text>

TASK 1 — SPEAKER ATTRIBUTION (skip if speakers are already given; then return "turns": []).
Decide who speaks each segment using linguistic evidence only:
- turn-taking: whoever asks a question is almost never the one answering it in the following segments
- people addressing each other by name or introducing themselves; self-references (my, I, we) that match one
  person's story; shifts in perspective (I/we/you); agreement/disagreement replies; interruptions; long pauses
- consistent role and style (e.g. a host asks short questions and reacts briefly; a guest gives long answers)
- segments are cut at pauses, not at speaker changes: if a speaker change happens inside a segment, assign the
  segment to whoever says most of it
Read the whole chunk before deciding, and check each turn boundary against the dialogue logic.
Do NOT invent speakers: a lecture, podcast monologue or voice note has exactly one speaker. Reuse ids from KNOWN
SPEAKERS when the same person continues; create a new id (S1, S2, ...) only for a genuinely new voice.
Turn ranges must cover every segment number in the chunk.

TASK 2 — KNOWLEDGE EXTRACTION. Capture only what is actually said in this chunk:
- topics: the subjects discussed, each with 2-5 word label, who discussed it, and 1-4 very short key points
- concepts: important technical terms, named entities, products, methods (1-4 words each)
- metrics: every number that matters (amounts, percentages, dates, durations, counts, targets, scores)
  with a short label and the value exactly as spoken
- decisions, actions (with owner if stated), open questions or risks
- summary: 2-3 sentences for this chunk

Return ONE JSON object:
{
  "speakers": [{"id": "S1", "name": "person's name if stated, else null", "role": "short role, e.g. interviewer", "evidence": "brief reason"}],
  "turns": [{"from": <first segment>, "to": <last segment>, "speaker": "S1"}],
  "topics": [{"label": "...", "speakers": ["S1"], "points": ["..."]}],
  "concepts": ["..."],
  "metrics": [{"label": "...", "value": "...", "speaker": "S1", "segment": <segment>}],
  "decisions": [{"text": "...", "speaker": "S1"}],
  "actions": [{"text": "...", "owner": "S1 or name or null"}],
  "risks": ["..."],
  "summary": "..."
}`;

function formatChunk(segments, acoustic) {
  return segments.map((segment, index) => {
    if (acoustic) return `[#${segment.id} ${formatTimestamp(segment.start)} ${segment.speaker}] ${segment.text}`;
    const previous = index > 0 ? segments[index - 1] : null;
    const gap = previous ? Math.max(0, segment.start - previous.end).toFixed(1) : '0.0';
    return `[#${segment.id} ${formatTimestamp(segment.start)} gap=${gap}] ${segment.text}`;
  }).join('\n');
}

function describeKnownSpeakers(registry) {
  if (registry.size === 0) return 'KNOWN SPEAKERS: none yet.';
  const lines = [...registry.values()].map((s) => `- ${s.id}: ${s.name || 'unnamed'}${s.role ? `, ${s.role}` : ''}`);
  return `KNOWN SPEAKERS (from earlier in the recording):\n${lines.join('\n')}`;
}

/**
 * Analyse the full transcript chunk by chunk.
 * Returns speaker-attributed segments, a speaker registry and merged knowledge notes.
 */
export async function understandTranscript(transcription, { speakerHint, audioType, onProgress } = {}) {
  const profile = audioTypeProfile(audioType);
  const acoustic = transcription.acousticDiarization;
  const segments = transcription.segments.map((segment) => ({ ...segment }));
  const chunks = chunkBySize(segments, config.analysis.chunkChars, (segment) => segment.text.length + 24);

  const registry = new Map();
  const chunkNotes = [];

  if (acoustic) {
    for (const id of new Set(segments.map((segment) => segment.speaker))) {
      registry.set(id, { id, name: null, role: null });
    }
  }

  for (let index = 0; index < chunks.length; index++) {
    onProgress?.(`Analyzing part ${index + 1} of ${chunks.length}`);
    const chunk = chunks[index];
    const hint = speakerHint
      ? `The uploader believes there are about ${speakerHint} speaker(s) in the whole recording — treat this as a hint, not a fact.`
      : 'The number of speakers is unknown; infer it from the evidence.';

    const user = [
      `RECORDING TYPE: ${profile.label}. ${profile.analysis}`,
      acoustic ? 'Speakers are already identified acoustically. Only add names/roles if they are stated.' : hint,
      describeKnownSpeakers(registry),
      `CHUNK ${index + 1} of ${chunks.length} (segments #${chunk[0].id}-#${chunk.at(-1).id}):`,
      formatChunk(chunk, acoustic)
    ].join('\n\n');

    const result = await chatJSON({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
      tier: 'fast',
      maxTokens: config.analysis.maxTokens,
      temperature: 0.1,
      reasoningEffort: config.analysis.reasoningEffort
    }, `understanding chunk ${index + 1}`);

    mergeSpeakers(registry, result.speakers);
    if (!acoustic) applyTurns(chunk, result.turns, registry);
    chunkNotes.push({ ...result, range: [chunk[0].start, chunk.at(-1).end] });
  }

  // Segments the model left unattributed inherit the previous speaker (speech turns are contiguous).
  let carry = segments.find((segment) => segment.speaker)?.speaker || [...registry.keys()][0] || 'S1';
  for (const segment of segments) {
    if (!segment.speaker) segment.speaker = carry;
    carry = segment.speaker;
  }

  const speakers = computeSpeakerStats(segments, registry);
  return { segments, speakers, knowledge: mergeKnowledge(chunkNotes), chunkCount: chunks.length };
}

function mergeSpeakers(registry, speakers = []) {
  for (const speaker of Array.isArray(speakers) ? speakers : []) {
    if (!speaker?.id) continue;
    const id = String(speaker.id).toUpperCase().replace(/^SPEAKER\s*/, 'S');
    const existing = registry.get(id) || { id, name: null, role: null };
    registry.set(id, {
      id,
      name: existing.name || (speaker.name && speaker.name !== 'null' ? speaker.name : null),
      role: existing.role || speaker.role || null,
      evidence: existing.evidence || speaker.evidence || null
    });
  }
}

function applyTurns(chunk, turns = [], registry) {
  const byId = new Map(chunk.map((segment) => [segment.id, segment]));
  for (const turn of Array.isArray(turns) ? turns : []) {
    const from = Number(turn.from);
    const to = Number(turn.to ?? turn.from);
    const speaker = String(turn.speaker || '').toUpperCase().replace(/^SPEAKER\s*/, 'S');
    if (!Number.isFinite(from) || !speaker) continue;
    if (!registry.has(speaker)) registry.set(speaker, { id: speaker, name: null, role: null });
    for (let id = from; id <= to; id++) {
      const segment = byId.get(id);
      if (segment) segment.speaker = speaker;
    }
  }
}

function computeSpeakerStats(segments, registry) {
  const stats = new Map();
  let previous = null;
  for (const segment of segments) {
    const entry = stats.get(segment.speaker) || { seconds: 0, words: 0, turns: 0, firstAt: segment.start };
    entry.seconds += Math.max(0, segment.end - segment.start);
    entry.words += segment.text.split(/\s+/).filter(Boolean).length;
    if (segment.speaker !== previous) entry.turns += 1;
    previous = segment.speaker;
    stats.set(segment.speaker, entry);
  }

  const totalSeconds = [...stats.values()].reduce((sum, s) => sum + s.seconds, 0) || 1;
  // Order speakers by first appearance and renumber S1..Sn so ids are stable and gap-free.
  const ordered = [...stats.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt);
  const renumber = new Map(ordered.map(([id], index) => [id, `S${index + 1}`]));
  for (const segment of segments) segment.speaker = renumber.get(segment.speaker);

  return ordered.map(([id, entry]) => {
    const info = registry.get(id) || {};
    const newId = renumber.get(id);
    return {
      id: newId,
      label: info.name || `Speaker ${newId.slice(1)}`,
      name: info.name || null,
      role: info.role || null,
      talkTimeSeconds: Math.round(entry.seconds),
      talkTimePercent: Math.round((entry.seconds / totalSeconds) * 1000) / 10,
      words: entry.words,
      turns: entry.turns,
      originalId: id
    };
  });
}

function mergeKnowledge(chunkNotes) {
  const topics = new Map();
  const concepts = new Map();
  const metrics = [];
  const decisions = [];
  const actions = [];
  const risks = [];
  const summaries = [];

  const keyOf = (text) => contentStems(text).sort().join(' ');
  const asArray = (value) => (Array.isArray(value) ? value : []);

  for (const note of chunkNotes) {
    if (note.summary) summaries.push({ range: note.range, text: note.summary });
    for (const topic of asArray(note.topics)) {
      if (!topic?.label) continue;
      const key = keyOf(topic.label) || topic.label.toLowerCase();
      const entry = topics.get(key) || { label: topic.label, speakers: new Set(), points: [], mentions: 0, firstAt: note.range[0] };
      entry.mentions += 1;
      asArray(topic.speakers).forEach((s) => entry.speakers.add(String(s).toUpperCase()));
      entry.points.push(...asArray(topic.points).filter(Boolean));
      topics.set(key, entry);
    }
    for (const concept of asArray(note.concepts)) {
      const label = typeof concept === 'string' ? concept : concept?.label;
      if (!label) continue;
      const key = keyOf(label) || label.toLowerCase();
      const entry = concepts.get(key) || { label, mentions: 0 };
      entry.mentions += 1;
      concepts.set(key, entry);
    }
    metrics.push(...asArray(note.metrics).filter((m) => m?.value));
    decisions.push(...asArray(note.decisions).filter((d) => d?.text || typeof d === 'string'));
    actions.push(...asArray(note.actions).filter((a) => a?.text || typeof a === 'string'));
    risks.push(...asArray(note.risks).filter(Boolean));
  }

  return {
    summaries,
    topics: [...topics.values()].map((t) => ({ ...t, speakers: [...t.speakers] })),
    concepts: [...concepts.values()].sort((a, b) => b.mentions - a.mentions),
    metrics,
    decisions: decisions.map((d) => (typeof d === 'string' ? { text: d } : d)),
    actions: actions.map((a) => (typeof a === 'string' ? { text: a } : a)),
    risks
  };
}

/** Remap speaker ids inside knowledge notes after renumbering. */
export function remapKnowledgeSpeakers(knowledge, speakers) {
  const map = new Map(speakers.map((s) => [s.originalId, s.id]));
  const fix = (id) => (id ? map.get(String(id).toUpperCase()) || id : id);
  return {
    ...knowledge,
    topics: knowledge.topics.map((t) => ({ ...t, speakers: [...new Set(t.speakers.map(fix))] })),
    metrics: knowledge.metrics.map((m) => ({ ...m, speaker: fix(m.speaker) })),
    decisions: knowledge.decisions.map((d) => ({ ...d, speaker: fix(d.speaker) })),
    actions: knowledge.actions.map((a) => ({ ...a, owner: fix(a.owner) }))
  };
}

/** Render the merged notes as a compact text digest that fits within maxChars. */
export function buildKnowledgeDigest(knowledge, speakers, maxChars = config.analysis.digestChars) {
  const speakerLine = speakers.map((s) => `${s.id} = ${s.label}${s.role ? ` (${s.role})` : ''}, ${s.talkTimePercent}% talk time`).join('; ');

  const render = (withPoints, conceptLimit) => [
    `SPEAKERS (${speakers.length}): ${speakerLine}`,
    'CHRONOLOGICAL SUMMARY:',
    ...knowledge.summaries.map((s) => `[${formatTimestamp(s.range[0])}] ${s.text}`),
    'TOPICS (in order of first appearance):',
    ...[...knowledge.topics].sort((a, b) => a.firstAt - b.firstAt).map((t) =>
      `- ${t.label} [${t.speakers.join(', ')}; mentioned ${t.mentions}x]${withPoints && t.points.length ? `: ${t.points.join('; ')}` : ''}`),
    `CONCEPTS: ${knowledge.concepts.slice(0, conceptLimit).map((c) => c.label).join(', ')}`,
    'METRICS:',
    ...knowledge.metrics.map((m) => `- ${m.label}: ${m.value}${m.speaker ? ` (${m.speaker})` : ''}`),
    'DECISIONS:',
    ...knowledge.decisions.map((d) => `- ${d.text}${d.speaker ? ` (${d.speaker})` : ''}`),
    'ACTIONS:',
    ...knowledge.actions.map((a) => `- ${a.text}${a.owner ? ` (owner: ${a.owner})` : ''}`),
    knowledge.risks.length ? `RISKS / OPEN QUESTIONS: ${knowledge.risks.join('; ')}` : ''
  ].filter(Boolean).join('\n');

  let digest = render(true, 40);
  if (digest.length > maxChars) digest = render(false, 30);
  if (digest.length > maxChars) digest = render(false, 15);
  return digest.length > maxChars ? `${digest.slice(0, maxChars)}\n...[digest truncated]` : digest;
}
