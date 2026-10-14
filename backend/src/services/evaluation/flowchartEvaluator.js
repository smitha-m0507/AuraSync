// Flowchart (concept tree) evaluation.
//
// Eight deterministic metrics compare the tree against the transcript itself, so a hallucinating or
// bloated tree is caught independently of the model that produced it. An optional LLM judge adds a
// semantic rating of hierarchy and flow, which lexical metrics cannot capture.

import { chatJSON } from '../llm.js';
import { config } from '../../config.js';
import {
  contentStems, extractKeyphrases, extractNumbers, sameNumber, jaccard, wordCount
} from '../nlp/text.js';
import { displayText } from '../flowchart/treeLayout.js';

export const METRIC_WEIGHTS = {
  structure: 0.14,
  coverage: 0.18,
  groundedness: 0.18,
  metricFidelity: 0.10,
  conciseness: 0.08,
  distinctiveness: 0.07,
  balance: 0.05,
  speakerAttribution: 0.05,
  llmJudge: 0.15
};

const METRIC_INFO = {
  structure: { label: 'Structural validity', description: 'Single root, connected, acyclic, one parent per node, depth and branch count within limits.' },
  coverage: { label: 'Keyword coverage', description: 'Share of the most salient transcript keyphrases (frequency-weighted RAKE) represented in the tree.' },
  groundedness: { label: 'Groundedness', description: 'Share of nodes whose wording and numbers actually occur in the transcript (hallucination check).' },
  metricFidelity: { label: 'Metric fidelity', description: 'Numbers in the tree that match the transcript (precision) and capture of the most-mentioned figures (recall).' },
  conciseness: { label: 'Conciseness', description: 'Share of labels that are keywords within the word limit rather than sentences.' },
  distinctiveness: { label: 'Distinctiveness', description: 'Share of nodes that are not near-duplicates of another node (stem Jaccard < 0.6).' },
  balance: { label: 'Branch balance', description: 'Share of internal nodes with a readable number of children (2 to the configured maximum).' },
  speakerAttribution: { label: 'Speaker attribution', description: 'Themes attributed to detected speakers, and every major speaker represented in the tree.' },
  llmJudge: { label: 'LLM judge', description: 'Independent model rating (1-5) of faithfulness, coverage, hierarchy, conciseness and flow.' }
};

const round = (value) => Math.round(value * 1000) / 1000;
const ratio = (part, whole) => (whole === 0 ? 1 : part / whole);

function childMap(nodes, edges) {
  const map = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) map.get(edge.from)?.push(edge.to);
  return map;
}

function evaluateStructure(nodes, edges) {
  const { minBranches, maxBranches, maxDepth, maxNodes } = config.flowchart;
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map();
  for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);

  const roots = nodes.filter((node) => !incoming.get(node.id));
  const children = childMap(nodes, edges);

  const reachable = new Set();
  let cyclic = false;
  if (roots.length === 1) {
    const stack = [[roots[0].id, new Set()]];
    while (stack.length) {
      const [id, path] = stack.pop();
      if (path.has(id)) { cyclic = true; continue; }
      reachable.add(id);
      const nextPath = new Set(path).add(id);
      for (const kid of children.get(id) || []) stack.push([kid, nextPath]);
    }
  }

  const depth = Math.max(0, ...nodes.map((node) => node.depth || 0));
  const rootChildren = roots.length === 1 ? (children.get(roots[0].id) || []).length : 0;

  const checks = [
    { name: 'single root', pass: roots.length === 1, detail: `${roots.length} root node(s)` },
    { name: 'connected', pass: reachable.size === nodes.length, detail: `${reachable.size}/${nodes.length} nodes reachable from root` },
    { name: 'acyclic, one parent per node', pass: !cyclic && [...incoming.values()].every((n) => n === 1) && edges.every((e) => ids.has(e.from) && ids.has(e.to)), detail: cyclic ? 'cycle detected' : 'ok' },
    { name: 'depth', pass: depth >= 2 && depth <= maxDepth, detail: `depth ${depth} (allowed 2-${maxDepth})` },
    { name: 'main branches', pass: rootChildren >= minBranches && rootChildren <= maxBranches, detail: `${rootChildren} themes (allowed ${minBranches}-${maxBranches})` },
    { name: 'size', pass: nodes.length <= maxNodes, detail: `${nodes.length} nodes (max ${maxNodes}) — keep only the most important keywords` }
  ];
  return {
    score: ratio(checks.filter((c) => c.pass).length, checks.length),
    details: { checks },
    issues: checks.filter((c) => !c.pass).map((c) => `Structure: ${c.name} failed — ${c.detail}.`)
  };
}

function evaluateCoverage(nodes, transcript) {
  const words = wordCount(transcript);
  // Grows with the transcript, but never beyond what a tree of maxNodes can hold — otherwise long recordings
  // would be asked to cover more salient phrases than an at-a-glance tree has room for.
  const capacity = Math.round(config.flowchart.maxNodes * 0.6);
  const limit = Math.min(capacity, Math.max(8, Math.round(words / 120)));
  const keyphrases = extractKeyphrases(transcript, { limit, minCount: words > 600 ? 2 : 1 });
  if (keyphrases.length === 0) return { score: null, details: { reason: 'no keyphrases found' }, issues: [] };

  const treeStems = new Set(nodes.flatMap((node) => contentStems(`${node.label} ${node.value || ''}`)));
  let coveredWeight = 0;
  const totalWeight = keyphrases.reduce((sum, k) => sum + k.weight, 0);
  const covered = [];
  const missing = [];
  for (const phrase of keyphrases) {
    const hits = phrase.stems.filter((s) => treeStems.has(s)).length;
    if (hits >= Math.ceil(phrase.stems.length / 2)) {
      coveredWeight += phrase.weight;
      covered.push(phrase.text);
    } else {
      missing.push(phrase.text);
    }
  }
  return {
    score: coveredWeight / totalWeight,
    details: { keyphrases: keyphrases.length, covered, missing },
    issues: missing.length ? [`Coverage: salient terms from the audio are not represented: ${missing.slice(0, 8).join(', ')}. Add them only if they are genuinely central.`] : []
  };
}

function evaluateGroundedness(nodes, transcriptStems, transcriptNumbers) {
  const candidates = nodes.filter((node) => node.depth > 0);
  const ungrounded = [];
  for (const node of candidates) {
    const stems = contentStems(node.label);
    const lexical = stems.length === 0 ? 1 : ratio(stems.filter((s) => transcriptStems.has(s)).length, stems.length);
    const numbers = extractNumbers(`${node.label} ${node.value || ''}`);
    const numbersOk = numbers.every((n) => transcriptNumbers.some((t) => sameNumber(t.value, n.value)));
    if (lexical < 0.5 || !numbersOk) ungrounded.push(displayText(node));
  }
  return {
    score: ratio(candidates.length - ungrounded.length, candidates.length),
    details: { checked: candidates.length, ungrounded },
    issues: ungrounded.length ? [`Groundedness: these nodes are not supported by the transcript wording or figures: ${ungrounded.join('; ')}. Replace them with terms actually used, or remove them.`] : []
  };
}

function evaluateMetricFidelity(nodes, transcriptNumbers) {
  const treeNumbers = nodes.flatMap((node) => extractNumbers(`${node.label} ${node.value || ''}`));
  // A "metric" without any figure is mislabelled and counts against precision.
  const valueless = nodes.filter((node) => node.type === 'metric' && extractNumbers(`${node.label} ${node.value || ''}`).length === 0);

  // Rank salient transcript figures by how often they are mentioned.
  const counts = [];
  for (const n of transcriptNumbers.filter((t) => t.salient)) {
    const existing = counts.find((c) => sameNumber(c.value, n.value));
    if (existing) existing.count += 1;
    else counts.push({ value: n.value, raw: n.raw, count: 1 });
  }
  counts.sort((a, b) => b.count - a.count);
  const important = counts.slice(0, 5);

  if (important.length === 0 && treeNumbers.length === 0 && valueless.length === 0) {
    return { score: null, details: { reason: 'no figures mentioned in the audio' }, issues: [] };
  }

  const grounded = treeNumbers.filter((n) => transcriptNumbers.some((t) => sameNumber(t.value, n.value)));
  const captured = important.filter((i) => treeNumbers.some((n) => sameNumber(n.value, i.value)));
  const precision = ratio(grounded.length, treeNumbers.length + valueless.length);
  const recall = ratio(captured.length, important.length);
  const missed = important.filter((i) => !captured.includes(i)).map((i) => i.raw);
  const invented = treeNumbers.filter((n) => !grounded.includes(n)).map((n) => n.raw);

  const issues = [];
  if (valueless.length) issues.push(`Metric fidelity: these "metric" nodes contain no figure — make them concepts or remove them: ${valueless.map((n) => displayText(n)).join('; ')}.`);
  if (invented.length) issues.push(`Metric fidelity: figures not found in the transcript: ${invented.join(', ')}.`);
  if (missed.length) issues.push(`Metric fidelity: frequently mentioned figures are missing: ${missed.join(', ')}. Add them as metric nodes if they matter.`);
  return {
    score: 0.6 * precision + 0.4 * recall,
    details: { precision: round(precision), recall: round(recall), treeFigures: treeNumbers.length, importantFigures: important.map((i) => i.raw), missed, invented, valueless: valueless.map((n) => displayText(n)) },
    issues
  };
}

function evaluateConciseness(nodes) {
  const limit = config.flowchart.maxLabelWords;
  const tooLong = nodes.filter((node) => wordCount(node.label) > (node.depth === 0 ? limit + 2 : limit));
  const words = nodes.map((node) => wordCount(node.label));
  return {
    score: ratio(nodes.length - tooLong.length, nodes.length),
    details: { averageWords: round(words.reduce((a, b) => a + b, 0) / Math.max(1, words.length)), limit, tooLong: tooLong.map((n) => n.label) },
    issues: tooLong.length ? [`Conciseness: shorten to at most ${limit} words: ${tooLong.map((n) => `"${n.label}"`).join(', ')}.`] : []
  };
}

function evaluateDistinctiveness(allNodes) {
  // The root naturally echoes its themes, so only compare the nodes below it.
  const nodes = allNodes.filter((node) => node.depth > 0);
  const stems = nodes.map((node) => contentStems(node.label));
  // A metric repeating a figure already stated elsewhere is a duplicate even when worded differently
  // ("200 mph" vs "200 miles per hour", "Super Bowl 2017" vs "Super Bowl year: 2017").
  const figures = nodes.map((node) => extractNumbers(`${node.label} ${node.value || ''}`).map((n) => n.value));
  const sameFigure = (i, j) => (nodes[i].type === 'metric' || nodes[j].type === 'metric')
    && figures[i].some((a) => figures[j].some((b) => sameNumber(a, b)));
  const duplicates = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < i; j++) {
      if ((stems[i].length && stems[j].length && jaccard(stems[i], stems[j]) >= 0.6) || sameFigure(i, j)) {
        duplicates.push(`"${nodes[i].label}" ≈ "${nodes[j].label}"`);
        break;
      }
    }
  }
  return {
    score: ratio(nodes.length - duplicates.length, nodes.length),
    details: { duplicates },
    issues: duplicates.length ? [`Distinctiveness: merge or differentiate near-duplicates: ${duplicates.join('; ')}.`] : []
  };
}

function evaluateBalance(nodes, edges) {
  const children = childMap(nodes, edges);
  const { maxChildren } = config.flowchart;
  const internal = nodes.filter((node) => node.depth === 1 || (node.depth > 1 && (children.get(node.id) || []).length > 0));
  const unbalanced = internal.filter((node) => {
    const count = (children.get(node.id) || []).length;
    return count < 2 || count > maxChildren;
  });
  return {
    score: internal.length === 0 ? null : ratio(internal.length - unbalanced.length, internal.length),
    details: { internalNodes: internal.length, unbalanced: unbalanced.map((n) => `${n.label} (${(children.get(n.id) || []).length} children)`) },
    issues: unbalanced.length ? [`Balance: each theme/sub-node should have 2-${maxChildren} children: ${unbalanced.map((n) => `${n.label} has ${(children.get(n.id) || []).length}`).join('; ')}.`] : []
  };
}

function evaluateSpeakerAttribution(nodes, speakers) {
  if (speakers.length <= 1) return { score: null, details: { reason: 'single speaker recording' }, issues: [] };
  const validIds = new Set(speakers.map((s) => s.id));
  const themes = nodes.filter((node) => node.depth === 1);
  const attributed = themes.filter((node) => node.speakers.some((id) => validIds.has(id)));
  const mentioned = new Set(nodes.flatMap((node) => node.speakers));
  const major = speakers.filter((s) => s.talkTimePercent >= 10);
  const represented = major.filter((s) => mentioned.has(s.id));
  const invalid = [...mentioned].filter((id) => !validIds.has(id));

  const issues = [];
  if (attributed.length < themes.length) issues.push('Speaker attribution: give every theme the ids of the speakers who discussed it.');
  if (represented.length < major.length) issues.push(`Speaker attribution: major speakers missing from the tree: ${major.filter((s) => !represented.includes(s)).map((s) => s.id).join(', ')}.`);
  if (invalid.length) issues.push(`Speaker attribution: unknown speaker ids used: ${invalid.join(', ')}.`);
  return {
    score: 0.5 * ratio(attributed.length, themes.length) + 0.5 * ratio(represented.length, major.length),
    details: { themesAttributed: `${attributed.length}/${themes.length}`, majorSpeakersRepresented: `${represented.length}/${major.length}`, invalidIds: invalid },
    issues
  };
}

function outline(nodes, edges) {
  const children = childMap(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = [];
  const walk = (id, indent) => {
    const node = byId.get(id);
    lines.push(`${'  '.repeat(indent)}- ${displayText(node)} [${node.type}${node.speakers.length ? `; ${node.speakers.join(',')}` : ''}]`);
    for (const kid of children.get(id) || []) walk(kid, indent + 1);
  };
  const root = nodes.find((node) => node.parent === null);
  if (root) walk(root.id, 0);
  return lines.join('\n');
}

async function evaluateWithJudge(nodes, edges, source) {
  const result = await chatJSON({
    system: `You are a strict, independent evaluator of concept trees generated from audio recordings.
Rate the TREE against the SOURCE on a 1-5 scale (5 = excellent) for:
- faithfulness: every node is supported by the source; nothing invented
- coverage: the central concepts, metrics, decisions and actions of the source are present
- hierarchy: children are genuine sub-parts of their parent; themes are distinct and well grouped
- conciseness: nodes are keywords/short phrases, not sentences or trivia
- flow: themes follow the order and logic of the conversation
Return JSON: {"scores": {"faithfulness": n, "coverage": n, "hierarchy": n, "conciseness": n, "flow": n}, "strengths": ["..."], "issues": ["..."]}`,
    messages: [{ role: 'user', content: `SOURCE:\n${source}\n\nTREE:\n${outline(nodes, edges)}` }],
    maxTokens: 2500,
    temperature: 0,
    reasoningEffort: 'medium'
  }, 'flowchart judge');

  const scores = result.scores || {};
  const values = Object.values(scores).map(Number).filter((n) => Number.isFinite(n));
  if (values.length === 0) return { score: null, details: { reason: 'judge returned no scores' }, issues: [] };
  const normalized = values.reduce((sum, v) => sum + (Math.min(5, Math.max(1, v)) - 1) / 4, 0) / values.length;
  return {
    score: normalized,
    details: { scores, strengths: result.strengths || [] },
    issues: (result.issues || []).map((issue) => `Judge: ${issue}`)
  };
}

/**
 * Evaluate a flat tree. `judgeSource` (transcript or notes) enables the LLM judge.
 * Returns per-metric scores, a weighted overall score, a validity verdict and actionable feedback.
 */
export async function evaluateFlowchart({ nodes, edges }, { transcript, speakers, judgeSource = null }) {
  const transcriptStems = new Set(contentStems(transcript));
  const transcriptNumbers = extractNumbers(transcript);

  const metrics = {
    structure: evaluateStructure(nodes, edges),
    coverage: evaluateCoverage(nodes, transcript),
    groundedness: evaluateGroundedness(nodes, transcriptStems, transcriptNumbers),
    metricFidelity: evaluateMetricFidelity(nodes, transcriptNumbers),
    conciseness: evaluateConciseness(nodes),
    distinctiveness: evaluateDistinctiveness(nodes),
    balance: evaluateBalance(nodes, edges),
    speakerAttribution: evaluateSpeakerAttribution(nodes, speakers)
  };

  if (judgeSource) {
    try {
      metrics.llmJudge = await evaluateWithJudge(nodes, edges, judgeSource);
    } catch (error) {
      metrics.llmJudge = { score: null, details: { reason: `judge unavailable: ${error.message.slice(0, 160)}` }, issues: [] };
    }
  }

  let weighted = 0;
  let weightSum = 0;
  for (const [name, metric] of Object.entries(metrics)) {
    if (metric.score === null || metric.score === undefined) continue;
    weighted += metric.score * METRIC_WEIGHTS[name];
    weightSum += METRIC_WEIGHTS[name];
  }
  const overall = weightSum ? weighted / weightSum : 0;

  const { passThreshold, groundednessThreshold, judgeThreshold, metricFloor } = config.evaluation;
  const gates = [
    { name: 'Structure is a valid tree', pass: metrics.structure.score === 1 },
    { name: `Groundedness ≥ ${groundednessThreshold}`, pass: metrics.groundedness.score >= groundednessThreshold },
    { name: `Overall ≥ ${passThreshold}`, pass: overall >= passThreshold }
  ];
  const failingMetrics = Object.entries(metrics)
    .filter(([, metric]) => typeof metric.score === 'number' && metric.score < metricFloor)
    .map(([name]) => METRIC_INFO[name].label);
  gates.push({ name: `Every metric ≥ ${metricFloor}`, pass: failingMetrics.length === 0, detail: failingMetrics.join(', ') || null });
  if (typeof metrics.llmJudge?.score === 'number') {
    gates.push({ name: `LLM judge ≥ ${judgeThreshold}`, pass: metrics.llmJudge.score >= judgeThreshold });
  }

  return {
    overall: round(overall),
    valid: gates.every((gate) => gate.pass),
    gates,
    metrics: Object.fromEntries(Object.entries(metrics).map(([name, metric]) => [name, {
      ...METRIC_INFO[name],
      weight: METRIC_WEIGHTS[name],
      score: metric.score === null || metric.score === undefined ? null : round(metric.score),
      details: metric.details
    }])),
    feedback: Object.values(metrics).flatMap((metric) => metric.issues),
    stats: {
      nodes: nodes.length,
      themes: nodes.filter((node) => node.depth === 1).length,
      depth: Math.max(0, ...nodes.map((node) => node.depth)),
      speakers: speakers.length
    }
  };
}

export { outline as treeOutline };
