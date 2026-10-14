import { chatJSON } from '../llm.js';
import { config } from '../../config.js';
import { flattenTree, layoutTree, nestTree } from '../flowchart/treeLayout.js';
import { evaluateFlowchart } from '../evaluation/flowchartEvaluator.js';
import { audioTypeProfile } from '../audioTypes.js';

function systemPrompt(audioType) {
  const profile = audioTypeProfile(audioType);
  const { minBranches, maxBranches, maxChildren, maxDepth, maxLabelWords, maxNodes } = config.flowchart;
  return `You design concept trees that let someone grasp an audio recording at a glance.
RECORDING TYPE: ${profile.label}. ${profile.flowchart}
Build a hierarchical keyword tree — NOT a detailed outline:
- root: the core concept of the WHOLE recording (2-6 words) — broad enough that every theme below is a part of it
- level 1: ${minBranches}-${maxBranches} main themes, ordered as they occur in the recording
- level 2: for each theme 2-${maxChildren} keywords — key concepts, named entities, metrics, decisions, actions, risks
- level 3 only when a keyword genuinely needs a sub-detail; never deeper than ${maxDepth} levels below the root
- labels are keywords or short noun phrases of at most ${maxLabelWords} words; never sentences; reuse the speakers' own terms
- metrics: short name in "label", the exact figure as spoken in "value" (e.g. "label": "Revenue target", "value": "$2 million")
- a metric node MUST contain a number in "value"; anything without a figure is a concept, not a metric
- every fact appears exactly once: never repeat the same figure or idea as both a concept and a metric
- at most ${maxNodes} nodes in total including the root — keep only the most important keywords
- "speakers": ids of the speakers who raised or discussed the node (use only the given ids)
- include only content present in the source; omit greetings, small talk and logistics
- "type" is one of: root, theme, concept, entity, metric, decision, action, risk

Return ONE JSON object:
{"root": {"label": "...", "type": "root", "children": [
  {"label": "...", "type": "theme", "speakers": ["S1"], "children": [
    {"label": "...", "type": "metric", "value": "...", "speakers": ["S2"], "children": []}
  ]}
]}}`;
}

function describeSpeakers(speakers) {
  return speakers.map((s) => `${s.id} = ${s.label}${s.role ? ` (${s.role})` : ''}, ${s.talkTimePercent}% talk time`).join('\n');
}

async function draftTree({ digest, summary, speakers, audioType }) {
  const user = [
    `CORE CONCEPT (suggested): ${summary.coreConcept}`,
    `SUMMARY: ${summary.executiveSummary}`,
    `SPEAKERS (${speakers.length}):\n${describeSpeakers(speakers)}`,
    `SOURCE NOTES:\n${digest}`
  ].join('\n\n');

  const result = await chatJSON({
    system: systemPrompt(audioType),
    messages: [{ role: 'user', content: user }],
    maxTokens: 4000,
    temperature: 0.2,
    reasoningEffort: 'medium'
  }, 'flowchart draft');
  return result.root || result;
}

async function refineTree({ digest, speakers, tree, feedback, audioType }) {
  const user = [
    `SPEAKERS (${speakers.length}):\n${describeSpeakers(speakers)}`,
    `SOURCE NOTES:\n${digest}`,
    `CURRENT TREE:\n${JSON.stringify(tree)}`,
    `AUTOMATIC EVALUATION FOUND THESE PROBLEMS:\n${feedback.map((f) => `- ${f}`).join('\n')}`,
    'Return the corrected full tree in the same JSON format. Fix the problems without breaking the rules; keep what was already good.'
  ].join('\n\n');

  const result = await chatJSON({
    system: systemPrompt(audioType),
    messages: [{ role: 'user', content: user }],
    maxTokens: 4000,
    temperature: 0.2,
    reasoningEffort: 'medium'
  }, 'flowchart refinement');
  return result.root || result;
}

/**
 * Generate an evaluated concept tree.
 * Draft → evaluate (lexical metrics + LLM judge) → while not valid: refine with the evaluator's feedback and
 * re-evaluate → keep the best attempt (valid first, then highest overall score).
 */
export async function generateFlowchart({ digest, summary, speakers, transcript, judgeSource, audioType, onProgress }) {
  const context = { transcript, speakers, judgeSource: config.evaluation.llmJudge ? judgeSource : null };
  const attempts = [];
  const isBetter = (candidate, current) =>
    (candidate.valid && !current.valid) || (candidate.valid === current.valid && candidate.overall > current.overall);

  onProgress?.('Drafting concept tree', 'visualizing');
  let tree = flattenTree(await draftTree({ digest, summary, speakers, audioType }));
  if (tree.nodes.length === 0) throw new Error('The model did not return a usable concept tree.');

  onProgress?.('Evaluating concept tree', 'evaluating');
  let evaluation = await evaluateFlowchart(tree, context);
  attempts.push({ attempt: 1, kind: 'draft', overall: evaluation.overall, valid: evaluation.valid });
  let best = { tree, evaluation, attempt: 1 };

  for (let i = 0; i < config.evaluation.maxRefinements && !best.evaluation.valid; i++) {
    onProgress?.(`Refining concept tree with evaluation feedback (pass ${i + 1})`, 'visualizing');
    try {
      tree = flattenTree(await refineTree({ digest, speakers, tree: nestTree(best.tree.nodes), feedback: best.evaluation.feedback, audioType }));
      if (tree.nodes.length === 0) throw new Error('refinement returned an empty tree');
      onProgress?.('Re-evaluating refined concept tree', 'evaluating');
      evaluation = await evaluateFlowchart(tree, context);
      attempts.push({ attempt: attempts.length + 1, kind: 'refinement', overall: evaluation.overall, valid: evaluation.valid });
      if (isBetter(evaluation, best.evaluation)) best = { tree, evaluation, attempt: attempts.length };
    } catch (error) {
      attempts.push({ attempt: attempts.length + 1, kind: 'refinement', error: error.message.slice(0, 200) });
    }
  }

  const layout = layoutTree(best.tree);
  return {
    flowchart: {
      version: 'concept-tree-1',
      title: summary.title,
      coreConcept: best.tree.nodes[0]?.label,
      speakers: speakers.map(({ id, label, role, talkTimePercent }) => ({ id, label, role, talkTimePercent })),
      ...layout
    },
    evaluation: { ...best.evaluation, attempts, selectedAttempt: best.attempt }
  };
}
