# AuraSync

**Audio-to-Intelligence Platform** - Transform meetings, lectures, and interviews into structured visual intelligence.

## Architecture

```
aurasync/
├── backend/          # Node.js Express API (port 4000)
│   ├── src/
│   │   ├── index.js      # Entry point, Express app
│   │   ├── db/
│   │   │   ├── pool.js       # MongoDB connection
│   │   │   ├── user.model.js
│   │   │   ├── job.model.js
│   │   │   └── report.model.js
│   │   ├── middleware/
│   │   │   ├── auth.js   # JWT verification
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js     # /api/v1/auth
│   │   │   ├── jobs.js     # /api/v1/jobs
│   │   │   ├── reports.js  # /api/v1/reports
│   │   │   └── users.js    # /api/v1/users
│   │   ├── services/
│   │   │   ├── agentPipeline.js  # Orchestrates AI agents
│   │   │   ├── llm.js                 # Multi-provider LLM client (Groq, Google, Together AI)
│   │   │   ├── transcriptionService.js # Groq Whisper / AssemblyAI
│   │   │   ├── agents/                # understanding, synthesis, flowchart, chat
│   │   │   ├── flowchart/             # tree flattening + layout
│   │   │   ├── evaluation/            # flowchart evaluation metrics
│   │   │   └── nlp/                   # tokenizer, RAKE, BM25, number extraction
│   │   └── utils/
│   │       ├── validators.js
│   │       └── jwt.js
│   ├── package.json
│   └── .env
└── frontend/         # React 18 + Vite (port 5173)
    └── src/
        ├── pages/
        ├── components/
        ├── context/
        └── services/
            └── api.js   # Axios instance with interceptors
```

## Prerequisites

- Node.js 18+
- MongoDB Atlas (or local MongoDB)
- A Groq API key (free tier works; its 8K tokens/minute limit adds waiting on long recordings)

## Setup

### 1. Clone and Install

```bash
git clone <repo-url>
cd aurasync
npm install
cd backend && npm install && cd ..
```

### 2. Configure Environment

Create `backend/.env` with the variables below and fill in the secrets. The only key strictly required
for the AI pipeline is `GROQ_API_KEY` (Whisper transcription + `openai/gpt-oss-120b`). Setting
`ASSEMBLYAI_API_KEY` switches transcription to AssemblyAI, which separates speakers acoustically.

### 3. Run Servers

```bash
# Terminal 1: Backend
cd backend && npm start

# Terminal 2: Frontend
npm run dev
```

## Environment Variables

Every model, threshold and limit is configurable; all have built-in defaults (see `backend/src/config.js`), so only set the ones you want to change.

| Variable | Description |
|----------|-------------|
| GROQ_API_KEY | Groq key — Whisper transcription and the default LLM |
| GROQ_MODEL / GROQ_FAST_MODEL | LLM for synthesis/flowchart/judge/chat, and for the per-chunk extraction pass |
| LLM_PROVIDERS | Fallback order, e.g. `groq,google` |
| ASSEMBLYAI_API_KEY | Optional: acoustic speaker diarization |
| TRANSCRIPTION_LANGUAGE | Force a language code; empty = auto-detect |
| FLOWCHART_* | Tree shape: branches, children, depth, label words, max nodes |
| EVAL_* | Evaluation thresholds, refinement passes, LLM judge on/off |
| CHAT_* | Chatbot context size and retrieval depth |

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/signup | Create account (no auth) |
| POST | /api/v1/auth/login | Login, returns tokens (no auth) |
| POST | /api/v1/auth/refresh | Refresh access token (no auth) |
| POST | /api/v1/auth/logout | Invalidate refresh token |
| GET | /api/v1/auth/me | Current user (requires auth) |

### Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/jobs/upload | Upload audio (`audio`, `outputType` = `flowchart` \| `chatbot`, optional `speakerCount` hint or `auto`) → `jobId` |
| GET | /api/v1/jobs/:id/status | Stage + progress message |
| GET | /api/v1/jobs/:id/result | Transcript, segments, speakers, summary, flowchart, evaluation, chat history |
| POST | /api/v1/jobs/:id/flowchart | Generate the flowchart for a chatbot job (`?force=true` regenerates) |
| POST | /api/v1/jobs/:id/chat | Ask a question about the recording (`{ question }`) |
| DELETE | /api/v1/jobs/:id/chat | Clear the conversation |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/reports | List reports (paginated) |
| GET | /api/v1/reports/:id | Single report |
| POST | /api/v1/reports | Save new report |
| DELETE | /api/v1/reports/:id | Delete report |
| PATCH | /api/v1/reports/:id/star | Toggle star |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/users/profile | Current profile |
| PATCH | /api/v1/users/profile | Update name |
| PATCH | /api/v1/users/upgrade | Simulate Pro upgrade |

## Agent Pipeline Flow

```
[Audio Upload]  outputType = flowchart | chatbot
     ↓
[1. Transcription]   Groq Whisper (verbose_json, timestamped segments; Whisper's no-speech/logprob
                     thresholds drop hallucinated silence)  — or AssemblyAI with acoustic diarization
     ↓
[2. Understanding]   Transcript split into chunks; per chunk one LLM call attributes each segment to a
                     speaker (turn-taking, forms of address, pauses, roles) and extracts topics, concepts,
                     metrics, decisions, actions, risks. A speaker registry carries across chunks.
                     → speaker count, names/roles, talk time from timestamps
     ↓
[3. Synthesis]       Title, core concept, executive summary, key points, tags (from notes covering the whole audio)
     ↓
[4a. Flowchart]      LLM builds a keyword concept tree → deterministic left-to-right layout
                     → evaluation → refinement with evaluation feedback until valid (EVAL_MAX_REFINEMENTS)
[4b. Chatbot]        Q&A grounded in the recording: whole transcript when short, BM25 retrieval when long;
                     answers cite [mm:ss] timestamps and refuse questions the audio doesn't answer
```

The audio file is deleted after transcription.

### Flowchart evaluation

Eight deterministic metrics compare the tree with the transcript itself (so a hallucinating tree is
caught independently of the model that produced it), plus an independent LLM judge:

| Metric | Weight | What it measures |
|--------|--------|------------------|
| Structural validity | 14% | Single root, connected, acyclic, one parent per node, depth, branch count, max nodes |
| Keyword coverage | 18% | Share of the most salient transcript keyphrases (frequency-weighted RAKE, Porter-stemmed) in the tree |
| Groundedness | 18% | Share of nodes whose wording and numbers occur in the transcript |
| Metric fidelity | 10% | Figures in the tree found in the transcript (precision) + capture of the most-mentioned figures (recall) |
| Conciseness | 8% | Labels within the word limit |
| Distinctiveness | 7% | No near-duplicate nodes (stem Jaccard ≥ 0.6, or the same figure stated twice) |
| Branch balance | 5% | Internal nodes with 2 to FLOWCHART_MAX_CHILDREN children |
| Speaker attribution | 5% | Themes attributed to speakers; every major speaker represented (multi-speaker audio only) |
| LLM judge | 15% | 1–5 ratings for faithfulness, coverage, hierarchy, conciseness, flow |

A tree is **valid** when it is structurally a tree, groundedness ≥ 0.7, overall ≥ 0.75, every metric
≥ 0.5 and the judge ≥ 0.6. Otherwise the evaluator's feedback is sent back to the model for a refinement
pass and the best attempt is kept. Metrics that don't apply (e.g. speaker attribution for one speaker)
are excluded and the weights renormalised.

### Speaker detection

With Groq Whisper, speakers are inferred from the conversation by the language model. This works well
for interviews, meetings and lectures, but a Whisper segment that contains two voices is assigned to one
speaker. For acoustic (voice-based) separation, set `ASSEMBLYAI_API_KEY`.

## File Formats

**Accepted:** MP3, WAV, M4A, OGG, FLAC, AAC, WEBM, MP4, OPUS — of any length (upload limit `MAX_FILE_SIZE_MB`, default 1024 MB).

Recordings are converted with a bundled ffmpeg (`ffmpeg-static`, no system install needed) to 16 kHz mono MP3 and
split into 10-minute parts (`TRANSCRIPTION_CHUNK_SECONDS`), so each request stays far below Groq's 25 MB limit.
Parts are transcribed in order and their timestamps merged onto one timeline. Long recordings take longer mainly
because of provider rate limits; transcription waits out rate-limit responses automatically.

## Development

```bash
# Frontend dev server
npm run dev

# Frontend build
npm run build

# Backend (from /backend)
npm start
```

## Production

```bash
# Frontend
npm run build
npm run preview

# Backend
NODE_ENV=production npm start
```