// Central, env-driven configuration for the audio intelligence pipeline.
// Every tunable lives here so nothing in the agents is hardcoded.

const num = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const list = (value, fallback) =>
  value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback;

export const config = {
  llm: {
    providers: list(process.env.LLM_PROVIDERS, ['groq', 'google']),
    groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    // Used for the per-chunk extraction pass (the most token-heavy step).
    groqFastModel: process.env.GROQ_FAST_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    googleModel: process.env.GOOGLE_MODEL || 'gemini-2.5-flash',
    togetherModel: process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 120000),
    maxRetries: num(process.env.LLM_MAX_RETRIES, 5)
  },
  transcription: {
    // auto = AssemblyAI (acoustic diarization) when its key is set, otherwise Groq Whisper.
    provider: (process.env.TRANSCRIPTION_PROVIDER || 'auto').toLowerCase(),
    groqModel: process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
    language: process.env.TRANSCRIPTION_LANGUAGE || '',
    groqMaxFileMb: num(process.env.GROQ_MAX_FILE_MB, 25),
    // Recordings are converted to mono MP3 at this bitrate and split into chunks of this length.
    chunkSeconds: num(process.env.TRANSCRIPTION_CHUNK_SECONDS, 600),
    bitrate: process.env.TRANSCRIPTION_BITRATE || '32k',
    maxRetries: num(process.env.TRANSCRIPTION_MAX_RETRIES, 8),
    maxRetryWaitSeconds: num(process.env.TRANSCRIPTION_MAX_RETRY_WAIT_SECONDS, 300),
    assemblyPollMs: num(process.env.ASSEMBLYAI_POLL_MS, 3000),
    assemblyTimeoutMs: num(process.env.ASSEMBLYAI_TIMEOUT_MS, 20 * 60 * 1000),
    // Whisper's own decoding thresholds for discarding non-speech segments.
    noSpeechThreshold: num(process.env.WHISPER_NO_SPEECH_THRESHOLD, 0.6),
    logprobThreshold: num(process.env.WHISPER_LOGPROB_THRESHOLD, -1.0)
  },
  analysis: {
    // Characters of transcript per extraction call. Keep prompt + completion under the provider TPM limit.
    chunkChars: num(process.env.ANALYSIS_CHUNK_CHARS, 6000),
    maxTokens: num(process.env.ANALYSIS_MAX_TOKENS, 5000),
    // Speaker attribution benefits from reasoning over turn boundaries.
    reasoningEffort: process.env.ANALYSIS_REASONING_EFFORT || 'medium',
    digestChars: num(process.env.ANALYSIS_DIGEST_CHARS, 14000)
  },
  flowchart: {
    minBranches: num(process.env.FLOWCHART_MIN_BRANCHES, 3),
    maxBranches: num(process.env.FLOWCHART_MAX_BRANCHES, 6),
    maxChildren: num(process.env.FLOWCHART_MAX_CHILDREN, 5),
    maxDepth: num(process.env.FLOWCHART_MAX_DEPTH, 3),
    maxLabelWords: num(process.env.FLOWCHART_MAX_LABEL_WORDS, 5),
    // Keeps the tree an at-a-glance overview rather than a detailed outline.
    maxNodes: num(process.env.FLOWCHART_MAX_NODES, 25)
  },
  evaluation: {
    passThreshold: num(process.env.EVAL_PASS_THRESHOLD, 0.75),
    // Every applicable metric must reach this floor, so one badly failing dimension can't hide behind the average.
    metricFloor: num(process.env.EVAL_METRIC_FLOOR, 0.5),
    groundednessThreshold: num(process.env.EVAL_GROUNDEDNESS_THRESHOLD, 0.7),
    judgeThreshold: num(process.env.EVAL_JUDGE_THRESHOLD, 0.6),
    maxRefinements: num(process.env.EVAL_MAX_REFINEMENTS, 1),
    llmJudge: bool(process.env.EVAL_LLM_JUDGE, true),
    judgeContextChars: num(process.env.EVAL_JUDGE_CONTEXT_CHARS, 14000)
  },
  chat: {
    // Transcripts shorter than this are given to the model whole; longer ones use retrieval.
    fullContextChars: num(process.env.CHAT_FULL_CONTEXT_CHARS, 14000),
    topK: num(process.env.CHAT_TOP_K, 6),
    windowChars: num(process.env.CHAT_WINDOW_CHARS, 1200),
    historyTurns: num(process.env.CHAT_HISTORY_TURNS, 6)
  }
};
