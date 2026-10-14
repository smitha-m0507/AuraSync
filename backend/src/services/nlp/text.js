// Lightweight, dependency-free NLP primitives used for evaluation and retrieval.
// These are deliberately model-independent so they can act as an objective check on LLM output.

import { stemmer } from 'stemmer';

// English function words plus spoken-language fillers that Whisper transcribes verbatim.
export const STOPWORDS = new Set(`
a about above after again against all almost also although always am among an and another any anybody anyone
anything anyway anyways are aren't around as at back be became because become been before being below between
both but by can can't cannot could couldn't did didn't do does doesn't doing don't done down during each either
else enough etc even ever every everybody everyone everything few for from further get gets getting go goes going
gone got gotten had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him
himself his how how's however i i'd i'll i'm i've if in into is isn't it it's its itself just kind kinda know
known knows let let's like likely lot lots made make makes making many may maybe me mean means might mine more
most much must mustn't my myself need needs neither never no nobody none nor not nothing now of off often oh ok
okay on once one ones only onto or other others otherwise ought our ours ourselves out over own per perhaps please
put quite rather really right said same say saying says see seem seemed seems shall shan't she she'd she'll she's
should shouldn't so some somebody someone something sometimes somewhat sort still such sure take takes than that
that's thats the their theirs them themselves then there there's therefore these they they'd they'll they're
they've thing things think this those though through thus to too toward towards try trying uh um umm under
unless until up upon us use used uses using very via want wanted wants was wasn't way we we'd we'll we're we've
well went were weren't what what's whatever when when's where where's whether which while who who's whoever
whole whom whose why why's will with within without won't would wouldn't yeah yes yet you you'd you'll you're
you've your yours yourself yourselves gonna wanna gotta hmm huh mhm uh-huh ah eh basically actually literally
anyway alright right okay stuff guess
`.split(/\s+/).filter(Boolean));

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;

export function tokenize(text = '') {
  return (String(text).toLowerCase().match(WORD_RE) || []).map((token) => token.replace(/’/g, "'"));
}

export function isContentToken(token) {
  if (STOPWORDS.has(token)) return false;
  if (/^\d/.test(token)) return true;
  return token.length > 2;
}

export function stem(token) {
  const base = token.replace(/'s$/, '');
  return /^\d/.test(base) ? base : stemmer(base);
}

/** Content-word stems of a text (stopwords removed). */
export function contentStems(text) {
  return tokenize(text).filter(isContentToken).map(stem);
}

export function wordCount(text = '') {
  return (String(text).match(WORD_RE) || []).length;
}

// ---------------------------------------------------------------------------
// Keyphrase extraction — frequency-weighted RAKE (Rose et al., 2010).
// Candidate phrases are maximal runs of content words between stopwords/punctuation;
// word score = degree / frequency; phrase score = sum of word scores × log-scaled occurrence count.
// ---------------------------------------------------------------------------
export function extractKeyphrases(text, { maxWords = 3, limit = 20, minCount = 1 } = {}) {
  const fragments = String(text).split(/[.!?,;:\n()[\]"“”…]+|\s[-–—]\s/);
  const candidates = [];

  for (const fragment of fragments) {
    let current = [];
    const flush = () => {
      if (current.length > 0 && current.length <= maxWords) candidates.push(current);
      current = [];
    };
    for (const token of tokenize(fragment)) {
      if (isContentToken(token) && !/^\d+$/.test(token)) current.push(token);
      else flush();
    }
    flush();
  }

  const frequency = new Map();
  const degree = new Map();
  for (const phrase of candidates) {
    for (const word of phrase) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
      degree.set(word, (degree.get(word) || 0) + phrase.length);
    }
  }

  // Aggregate identical phrases by their stem signature.
  const phrases = new Map();
  for (const phrase of candidates) {
    const key = phrase.map(stem).join(' ');
    const entry = phrases.get(key) || { text: phrase.join(' '), stems: phrase.map(stem), count: 0, score: 0 };
    entry.count += 1;
    entry.score = phrase.reduce((sum, word) => sum + degree.get(word) / frequency.get(word), 0);
    phrases.set(key, entry);
  }

  return [...phrases.values()]
    .filter((entry) => entry.count >= minCount)
    .map((entry) => ({ ...entry, weight: entry.score * (1 + Math.log(entry.count)) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Numbers / metrics
// ---------------------------------------------------------------------------
const MULTIPLIERS = {
  thousand: 1e3, k: 1e3, lakh: 1e5, lakhs: 1e5, million: 1e6, mn: 1e6, crore: 1e7, crores: 1e7, billion: 1e9, bn: 1e9
};
const NUMBER_RE = /([$€£₹])?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(%|percent|per cent|thousand|k\b|lakhs?|million|mn\b|crores?|billion|bn\b)?/gi;

/**
 * Extract numeric mentions. Each has a normalised numeric value so "1.2 million" == "1,200,000".
 * `salient` marks numbers likely to be metrics: with a unit/currency/percent, a decimal, or >= 10.
 */
export function extractNumbers(text = '') {
  const results = [];
  for (const match of String(text).matchAll(NUMBER_RE)) {
    const [raw, currency, intPart, decimals, unitRaw] = match;
    const unit = unitRaw ? unitRaw.toLowerCase().replace('per cent', 'percent') : '';
    let value = Number(`${intPart.replace(/,/g, '')}${decimals ? `.${decimals}` : ''}`);
    if (MULTIPLIERS[unit]) value *= MULTIPLIERS[unit];
    const isPercent = unit === '%' || unit === 'percent';
    results.push({
      raw: raw.trim(),
      value,
      isPercent,
      salient: Boolean(currency || unit || decimals || value >= 10)
    });
  }
  return results;
}

export function sameNumber(a, b) {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale < 1e-6;
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------
export function jaccard(aStems, bStems) {
  const a = new Set(aStems);
  const b = new Set(bStems);
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

// ---------------------------------------------------------------------------
// Okapi BM25 retrieval over transcript windows.
// ---------------------------------------------------------------------------
export class BM25Index {
  constructor(documents, { k1 = 1.5, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = documents.map((doc) => {
      const stems = contentStems(doc);
      const tf = new Map();
      for (const s of stems) tf.set(s, (tf.get(s) || 0) + 1);
      return { length: stems.length, tf };
    });
    this.avgLength = this.docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, this.docs.length);
    this.df = new Map();
    for (const doc of this.docs) {
      for (const term of doc.tf.keys()) this.df.set(term, (this.df.get(term) || 0) + 1);
    }
  }

  idf(term) {
    const n = this.docs.length;
    const df = this.df.get(term) || 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query, topK = 5) {
    const terms = [...new Set(contentStems(query))];
    const scored = this.docs.map((doc, index) => {
      let score = 0;
      for (const term of terms) {
        const tf = doc.tf.get(term);
        if (!tf) continue;
        const norm = tf + this.k1 * (1 - this.b + this.b * (doc.length / (this.avgLength || 1)));
        score += this.idf(term) * ((tf * (this.k1 + 1)) / norm);
      }
      return { index, score };
    });
    return scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
export function formatTimestamp(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Group consecutive items into chunks whose summed `size(item)` stays under maxSize. */
export function chunkBySize(items, maxSize, size) {
  const chunks = [];
  let current = [];
  let currentSize = 0;
  for (const item of items) {
    const itemSize = size(item);
    if (current.length > 0 && currentSize + itemSize > maxSize) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(item);
    currentSize += itemSize;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
