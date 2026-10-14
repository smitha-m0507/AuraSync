# AuraSync — FastAPI Backend

**Asynchronous Multi-Agent Audio-to-Visual Compiling Engine.**

This is the Python / FastAPI + LangGraph + Whisper + Plotly backend for
AuraSync. It powers the existing React UI **without any frontend changes** —
it speaks the exact same API contract (`/api/v1`, `{ success, data, error }`
envelope, JWT bearer auth, cookie refresh, and the same job status/result
shapes the UI polls).

---

## What it does

```
Upload Audio
   ↓
Subscription Validation  (free = 30 min max, premium = unlimited)
   ↓
Audio Ingestion          (format + duration + corruption checks, chunking)
   ↓
Whisper Transcription    (parallel chunks for long audio, merged in order)
   ↓
Parallel AI Analysis     (LangGraph: Flow + Metric + Summary agents)
   ↓
Validation Agent         (repairs Mermaid so it is never broken)
   ↓
Flowchart / Mindmap      (auto-chosen) + Plotly Dashboard
   ↓
Displayed in the existing UI (polling → status → result)
```

### Multi-agent architecture (LangGraph)

| Agent | File | Responsibility |
|-------|------|----------------|
| **Flow Understanding** | `app/agents/flow_agent.py` | Cleans filler/repeats; detects steps, decisions, loops, branches, dependencies, cause-effect, hierarchy; emits Mermaid (flowchart or mindmap, auto-chosen). |
| **Metric Extraction** | `app/agents/metric_agent.py` | Extracts every numerical value (%, dates, budget, revenue, hours, KPIs, targets, scores, counts…) into structured JSON. Regex fallback guarantees extraction. |
| **Validation** | `app/agents/validation_agent.py` | Validates and repairs Mermaid syntax so the UI never receives broken diagrams. |
| **Summary** | run in `app/services/pipeline.py` | Title, executive summary, tags. |

The graph runs Flow + Metric + Summary **in parallel**, then Validation, then
assembly (`app/services/pipeline.py`, `app/agents/assembler.py`).

### Outputs

* **Flowchart / Mindmap** — Mermaid string + positioned `nodes`/`edges`
  consumed directly by the existing `FlowchartSVG` / `MindMapSVG` components.
* **Dashboard** — `summary / speakers / topics / actions / decisions /
  timeline` consumed by the existing `Dashboard` component, plus
  Plotly-compatible figure JSON (`dashboard.plotly.figures`).

---

## Project structure

```
backend-py/
├── app/
│   ├── main.py                # FastAPI app, CORS, routers, startup
│   ├── config.py              # Settings (.env)
│   ├── models/schemas.py      # Pydantic models + job document
│   ├── routes/                # auth, jobs, reports, users, deps
│   ├── services/              # pipeline (LangGraph), orchestrator, job_store
│   ├── agents/                # flow, metric, validation, assembler, builders
│   ├── audio/                 # ingestion (validation/chunking), transcription
│   ├── prompts/               # LLM prompt templates
│   ├── subscription/          # free/premium limit enforcement
│   ├── validators/            # input validation
│   ├── db/                    # users + reports stores (Mongo + in-memory)
│   └── utils/                 # responses, jwt, llm client, logging
├── requirements.txt
├── pyproject.toml
├── .env.example
└── smoke_test.py              # end-to-end HTTP test
```

---

## Setup

```powershell
cd backend-py
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env    # then edit secrets
```

> **Whisper note:** `openai-whisper` pulls in PyTorch. If it is not installed
> or a model cannot be loaded, transcription transparently falls back to a
> demo transcript so the full pipeline still runs. Set a real
> `OPENAI_API_KEY` (or any OpenAI-compatible endpoint via `OPENAI_BASE_URL`)
> to enable real LLM agents; otherwise a deterministic offline generator is
> used. This makes the backend runnable out-of-the-box with zero external
> services (MongoDB also falls back to an in-memory store).

### Run

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 4000
```

The server listens on **port 4000** — the exact URL the React frontend already
targets (`src/services/api.js` → `http://localhost:4000/api/v1`). Start the
frontend as usual (`npm run dev`) and everything connects automatically.

> Run **either** this FastAPI backend **or** the legacy Node backend on port
> 4000, not both. This one implements the real audio pipeline.

### Test

```powershell
.\.venv\Scripts\python.exe smoke_test.py
```

Covers signup, auth, upload, polling to completion, visual + dashboard output,
report save/list, subscription-limit rejection, and error handling.

---

## API (matches the existing frontend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/signup` | Create account, returns `{ user, accessToken }` |
| POST | `/api/v1/auth/login` | Login, sets refresh cookie |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Clear refresh cookie |
| GET  | `/api/v1/auth/me` | Current user |
| POST | `/api/v1/jobs/upload` | Upload audio → `{ jobId }` |
| GET  | `/api/v1/jobs/{id}/status` | Stage + partial results |
| GET  | `/api/v1/jobs/{id}/result` | Full completed result |
| GET/POST/DELETE/PATCH | `/api/v1/reports…` | Saved reports |
| GET/PATCH | `/api/v1/users…` | Profile + Pro upgrade |

### Job stages (polled by the UI)

`pending → transcribing → diarizing → analyzing → visualizing → summarizing →
completed | failed`

### Subscription

Free users are blocked **before transcription** if audio exceeds
`MAX_FREE_DURATION_MINUTES` (default 30). The job is marked `failed` with an
upgrade message, which the UI surfaces via its existing subscription modal.
Premium (`isPro`) users are unlimited.

---

## Error handling

Graceful, meaningful responses for: unsupported format, empty audio, no speech
detected, corrupted file, Whisper failure (fallback), LLM timeout (retry +
fallback), Mermaid syntax errors (auto-repair), dashboard errors, and
subscription-exceeded.
