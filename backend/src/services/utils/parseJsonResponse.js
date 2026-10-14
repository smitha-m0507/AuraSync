export function parseJsonResponse(text, context = 'LLM') {
  if (!text || typeof text !== 'string') {
    throw new Error(`Empty response from ${context}`);
  }

  const trimmed = text.trim();

  // Strategy 1: Extract from markdown code blocks
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // continue to next strategy
    }
  }

  // Strategy 2: Find the first complete JSON object by scanning for balanced braces
  const jsonObject = extractFirstJsonObject(trimmed);
  if (jsonObject) {
    try {
      return JSON.parse(jsonObject);
    } catch {
      // continue to next strategy
    }
  }

  // Strategy 3: Try first { to last }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // continue
    }
  }

  throw new Error(`Failed to parse JSON from ${context} response. Raw: ${trimmed.substring(0, 300)}`);
}

function extractFirstJsonObject(text) {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}
