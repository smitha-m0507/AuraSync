// Converts the LLM's nested tree into flat nodes/edges and computes a deterministic left-to-right tidy layout.

const NODE_TYPES = new Set(['root', 'theme', 'concept', 'entity', 'metric', 'decision', 'action', 'risk']);

const LAYOUT = {
  rootWidth: 250,
  nodeWidth: 220,
  columnGap: 80,
  siblingGap: 16,
  padding: 40,
  charsPerLine: 24,
  maxLines: 3,
  lineHeight: 17,
  basePadding: 26,
  speakerRow: 16
};

/** Flatten a nested {label, type, value, speakers, children} tree into nodes + edges with stable ids. */
export function flattenTree(rootInput) {
  const nodes = [];
  const edges = [];
  if (!rootInput || typeof rootInput !== 'object') return { nodes, edges };

  const visit = (input, parentId, depth, branchIndex) => {
    const label = String(input.label ?? input.name ?? '').trim();
    if (!label) return;
    const id = `n${nodes.length}`;
    const rawType = String(input.type || '').toLowerCase();
    const type = depth === 0 ? 'root' : NODE_TYPES.has(rawType) ? rawType : depth === 1 ? 'theme' : 'concept';
    const value = input.value === undefined || input.value === null || input.value === '' ? null : String(input.value).trim();
    const speakers = Array.isArray(input.speakers)
      ? [...new Set(input.speakers.map((s) => String(s).toUpperCase().replace(/^SPEAKER\s*/, 'S')))]
      : [];

    nodes.push({ id, label, type, value, speakers, depth, parent: parentId, branchIndex });
    if (parentId) edges.push({ from: parentId, to: id });

    const children = Array.isArray(input.children) ? input.children : [];
    children.forEach((child, index) => {
      if (child && typeof child === 'object') visit(child, id, depth + 1, depth === 0 ? index : branchIndex);
    });
  };

  visit(rootInput, null, 0, -1);
  return { nodes, edges };
}

/** Rebuild the nested form (used when sending a tree back to the model for refinement). */
export function nestTree(nodes) {
  const byParent = new Map();
  for (const node of nodes) {
    const list = byParent.get(node.parent) || [];
    list.push(node);
    byParent.set(node.parent, list);
  }
  const build = (node) => ({
    label: node.label,
    type: node.type,
    ...(node.value ? { value: node.value } : {}),
    ...(node.speakers.length ? { speakers: node.speakers } : {}),
    children: (byParent.get(node.id) || []).map(build)
  });
  const root = nodes.find((node) => node.parent === null);
  return root ? build(root) : null;
}

export function displayText(node) {
  if (!node.value) return node.label;
  return node.label.includes(node.value) ? node.label : `${node.label}: ${node.value}`;
}

function wrap(text, charsPerLine, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > charsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, charsPerLine - 1)}…`;
    return kept;
  }
  return lines.map((line) => (line.length > charsPerLine + 6 ? `${line.slice(0, charsPerLine + 5)}…` : line));
}

/** Assign x/y/width/height to every node. Subtrees occupy disjoint vertical bands, parents are centred on them. */
export function layoutTree({ nodes, edges }) {
  const children = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) children.get(edge.from)?.push(edge.to);
  const byId = new Map(nodes.map((node) => [node.id, { ...node }]));

  for (const node of byId.values()) {
    const width = node.depth === 0 ? LAYOUT.rootWidth : LAYOUT.nodeWidth;
    const lines = wrap(displayText(node), node.depth === 0 ? LAYOUT.charsPerLine + 2 : LAYOUT.charsPerLine, LAYOUT.maxLines);
    node.lines = lines;
    node.width = width;
    node.height = LAYOUT.basePadding + lines.length * LAYOUT.lineHeight + (node.speakers.length ? LAYOUT.speakerRow : 0);
  }

  const columnX = (depth) => LAYOUT.padding + (depth === 0 ? 0 : LAYOUT.rootWidth + LAYOUT.columnGap + (depth - 1) * (LAYOUT.nodeWidth + LAYOUT.columnGap));

  const subtreeHeight = new Map();
  const measure = (id) => {
    const node = byId.get(id);
    const kids = children.get(id) || [];
    const kidsHeight = kids.reduce((sum, kid) => sum + measure(kid), 0) + Math.max(0, kids.length - 1) * LAYOUT.siblingGap;
    const height = Math.max(node.height, kidsHeight);
    subtreeHeight.set(id, height);
    return height;
  };

  const place = (id, top) => {
    const node = byId.get(id);
    const band = subtreeHeight.get(id);
    const kids = children.get(id) || [];
    const kidsHeight = kids.reduce((sum, kid) => sum + subtreeHeight.get(kid), 0) + Math.max(0, kids.length - 1) * LAYOUT.siblingGap;
    let cursor = top + (band - kidsHeight) / 2;
    for (const kid of kids) {
      place(kid, cursor);
      cursor += subtreeHeight.get(kid) + LAYOUT.siblingGap;
    }
    node.x = columnX(node.depth);
    node.y = Math.round(top + band / 2 - node.height / 2);
  };

  const root = nodes.find((node) => node.parent === null);
  if (!root) return { nodes: [], edges: [], width: 0, height: 0 };
  measure(root.id);
  place(root.id, LAYOUT.padding);

  const laidOut = [...byId.values()];
  const maxDepth = Math.max(...laidOut.map((node) => node.depth));
  return {
    nodes: laidOut,
    edges,
    width: columnX(maxDepth) + (maxDepth === 0 ? LAYOUT.rootWidth : LAYOUT.nodeWidth) + LAYOUT.padding,
    height: subtreeHeight.get(root.id) + LAYOUT.padding * 2
  };
}
