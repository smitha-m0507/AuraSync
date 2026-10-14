# AuraSync Project Overview

## 1. What AuraSync Does

AuraSync is an audio-to-intelligence application. A user uploads a meeting, lecture, interview, or other recording, and the system turns it into information that is easier to review:

- A text transcript
- Speaker labels and speaker-related details
- A concise summary and extracted key points
- A visual concept flowchart/tree
- A chat interface for asking questions about the recording
- Saved reports that can be revisited later

The main idea is to transform unstructured audio into structured, searchable results.

## 2. High-Level Architecture

```text
Browser (React + Vite)
    │ HTTP requests, JSON responses, audio upload
    ▼
API backend (choose Node/Express OR Python/FastAPI)
    │
    ├── Authentication and user/report/job routes
    ├── Audio validation and temporary storage
    ├── Speech transcription
    ├── Speaker and content analysis
    ├── Summary, flowchart, or question answering
    └── Persistence (MongoDB, depending on backend configuration)
    │
    ▼
React results workspace and saved Reports
```

The frontend uses the API base URL `http://localhost:4000/api/v1` unless `VITE_API_URL` overrides it. Only one backend should use port 4000 at a time.

## 3. Technology Stack

### Frontend

| Technology | Role |
|---|---|
| React 18 | Component-based user interface |
| Vite | Local development server and production bundler |
| React Router | Page navigation and protected routes |
| Tailwind CSS | Utility-based styling |
| Framer Motion | Page and interface transitions |
| Axios | HTTP requests to the API, including auth refresh handling |
| React Markdown + remark-gfm | Rendering formatted assistant/report content |

### Node.js Backend

| Technology | Role |
|---|---|
| Node.js + Express | REST API server |
| MongoDB + Mongoose | Persistent user, job, and report records |
| Multer | Multipart audio upload handling |
| JWT + bcryptjs | Access/refresh authentication and password hashing |
| Groq SDK | LLM and Whisper API access |
| Google Generative AI SDK | Optional LLM provider |
| AssemblyAI | Optional transcription with acoustic speaker diarization |
| FFmpeg | Audio conversion/preparation support |
| Helmet, CORS, express-rate-limit | HTTP security headers, cross-origin policy, and request limits |

The LLM and transcription providers are selected/configured through environment variables. The Node backend supports a provider fallback order; check `backend/src/config.js` and the root README for the settings used by this checkout.

### Python Backend

| Technology | Role |
|---|---|
| Python 3.10+ | Backend language |
| FastAPI + Uvicorn | Asynchronous REST API and ASGI server |
| Pydantic + pydantic-settings | Request/data validation and environment-based configuration |
| Motor | Asynchronous MongoDB client |
| OpenAI Whisper | Local audio transcription when model dependencies are available |
| LangGraph + LangChain Core | Orchestration of parallel analysis agents |
| Pydub, SoundFile, NumPy | Audio loading and processing support |
| CairoSVG, ReportLab, svgwrite, Pillow | Diagram and document export support |
| python-jose + passlib/bcrypt | JWT and password-related authentication support |

## 4. Main Frontend Areas

- **Signup and Login:** Create an account and establish a session.
- **Home:** The authenticated starting page.
- **Audio Lab:** Select an audio category, upload a file, choose an output, monitor processing, and review the result.
- **Reports:** Browse, filter, open, star, and delete saved analyses.

The app uses React Context providers for authentication, reports/application state, Audio Lab state, theming, and toast notifications. `LabContext` persists selected per-user workflow state in browser local storage and continues polling jobs while they are running.

Useful frontend files:

- `src/App.jsx` - Context providers, routes, and protected pages
- `src/context/AuthContext.jsx` - Login, logout, session restoration
- `src/context/LabContext.jsx` - Upload state, job history, polling, and result loading
- `src/context/AppContext.jsx` - Saved report state and report operations
- `src/services/api.js` - API URL, Axios client, token refresh, and endpoint wrappers
- `src/pages/AudioLabPage.jsx` - Audio workflow and analysis workspace
- `src/pages/ReportsPage.jsx` - Saved report library

## 5. End-to-End User and Processing Workflow

### A. Session and authentication

1. A user signs up or logs in through the React interface.
2. The backend hashes passwords and issues authentication tokens.
3. The frontend keeps the access token in memory and sends it with protected API calls.
4. A refresh token is kept in an HTTP-only cookie. After a reload, the frontend requests a fresh access token; if an API call returns 401, the Axios interceptor tries refreshing once.
5. Routes such as Audio Lab and Reports are protected until the user is authenticated.

### B. Choose and upload audio

1. The user chooses an audio category, selects a recording, and may provide a speaker-count hint.
2. The browser checks the filename extension and reads the duration where possible. The backend performs its own file and upload checks; client-side validation is not a security boundary.
3. The user selects a Flowchart or Chatbot output.
4. The frontend sends the file and form fields as `multipart/form-data` to `POST /api/v1/jobs/upload`.
5. The backend stores the uploaded file temporarily, creates a job associated with the user, starts processing, and returns a `jobId`.

### C. Process the job asynchronously

The upload request does not wait for the entire AI workflow. The backend processes the job in the background and updates its status. The frontend polls job history approximately every three seconds and displays progress.

In the Node backend, the main stages are:

1. **Transcribe:** Send audio to Groq Whisper or AssemblyAI, depending on configuration. Transcription produces text and, when available, timestamped segments.
2. **Understand:** Analyze transcript chunks to identify speakers and extract useful knowledge such as topics, concepts, metrics, decisions, actions, and risks.
3. **Summarize:** Produce a title and concise summary from the extracted knowledge.
4. **Build the selected output:** For a Flowchart job, generate a concept tree. A Chatbot job prepares the transcript and related context for later questions.
5. **Evaluate/refine the flowchart:** Compare the generated tree with transcript content and structure. If it does not meet configured quality thresholds, feedback can be sent for a refinement pass.
6. **Complete or fail:** Save the job status and result so the frontend can load them. The Node pipeline removes its temporary audio file when processing ends.

The UI generally shows these stages as `pending`, `transcribing`, `analyzing`, `summarizing`, `visualizing`, `evaluating`, then `completed` or `failed`. Exact stages depend on the selected output and backend.

### D. Review, chat, and save

When a job completes, the UI requests `GET /api/v1/jobs/:id/result`. The workspace can display the transcript, speaker labels, summary, concept tree, and evaluation. Users can zoom or download the visualization, regenerate it, or switch to the transcript and chatbot views.

For Chatbot output, a user submits a question to the job chat endpoint. The Node chat agent uses the recording and conversation context to construct an answer; for long recordings it can retrieve relevant passages rather than include the entire transcript. This retrieval-plus-generation approach is commonly called **RAG** (retrieval-augmented generation). Chat turns are stored with the job.

When the user selects **Save to Reports**, the frontend sends the analysis data to the reports API. Reports can then be listed, paginated, opened in detail, starred, or deleted without reprocessing the original audio.

## 6. Important Concepts

- **Transcription:** Converting spoken audio into written text. It is speech recognition, not a guarantee that every word or speaker is identified correctly.
- **Diarization:** Determining which speaker spoke when. It does not necessarily reveal a speaker's real-world identity. Acoustic diarization analyzes voice characteristics; linguistic attribution infers speakers from conversational clues.
- **LLM (large language model):** A model used here to interpret transcript content, create summaries/visual structures, or formulate answers.
- **Agent pipeline:** A sequence or graph of focused AI tasks. For example, one task can extract a flow, another can extract metrics, and an assembler can combine their results.
- **Chunking:** Splitting a long recording or transcript into smaller pieces to fit model limits. Good chunking and shared context help avoid losing information across boundaries.
- **Flowchart evaluation:** Checking a generated visual against the transcript for structural validity, coverage, groundedness, conciseness, and related quality dimensions. Evaluation improves quality but does not prove correctness.
- **Asynchronous job:** A long-running task represented by a job ID and status, allowing the browser to poll for progress instead of keeping one HTTP request open.
- **JWT and refresh cookie:** Access tokens authorize API calls; a longer-lived refresh token lets the app restore a session without keeping the access token in persistent browser storage.
- **BM25:** A text-search ranking method used to find transcript passages relevant to a question. It is a retrieval step, not an AI model.

## 7. Backend Implementations and Compatibility

This repository contains two alternative backend implementations:

### Node/Express backend (`backend/`)

This is the better fit for the current React Audio Lab contract. Its jobs route accepts `flowchart` and `chatbot`, the `audioType` field, and an automatic speaker hint. It implements the job history, result, chat, and optional flowchart-generation endpoints used by the UI.

Key files:

- `backend/src/index.js` - Express setup, middleware, database startup, and route mountinga
- `backend/src/routes/` - Auth, jobs, reports, and user endpoints
- `backend/src/services/agentPipeline.js` - Main transcription-to-analysis orchestration
- `backend/src/services/agents/` - Understanding, synthesis, flowchart, and chat tasks
- `backend/src/services/evaluation/` - Flowchart quality evaluation
- `backend/src/db/` - Mongoose connection and data models

### Python/FastAPI backend (`backend-py/`)

This is a separate Python implementation with FastAPI routes, Whisper transcription, LangGraph agents, and export support. Its orchestration is in `backend-py/app/services/orchestrator.py`; the analysis graph is in `backend-py/app/services/pipeline.py`.

**It is not currently a drop-in replacement for the frontend.** The UI submits `flowchart` or `chatbot`, an `audioType`, and may submit `speakerCount: "auto"`. The Python upload route currently allows `mindmap`, `flowchart`, or `dashboard`, defines `speakerCount` as an integer, and does not accept the UI's `audioType` field. The API result/output shape also differs in places. These contracts should be reconciled before using the Python service with the existing UI.

Run only one backend on port 4000. The project root README documents the Node setup; `backend-py/README.md` documents the Python setup.

## 8. API Areas

The frontend's API client wraps these main route groups:

| Route group | Purpose |
|---|---|
| `/api/v1/auth` | Signup, login, logout, refresh, current user |
| `/api/v1/jobs` | Upload, list/history, status, result, chat, flowchart generation, deletion |
| `/api/v1/reports` | Save, list, fetch, star, and delete saved reports |
| `/api/v1/users` | Profile and account operations |

Responses generally use a JSON success/data/error envelope. Authentication is required for user-specific jobs and reports.

## 9. Data and File Lifecycle

- **User records** hold account and authentication-related data.
- **Job records** track ownership, input/output type, processing status, transcript, analysis, and results.
- **Report records** hold user-saved snapshots of analysis results.
- **Audio uploads** are written to temporary storage for processing. The Node pipeline deletes its temporary source file after the pipeline exits; check the chosen backend's implementation and deployment storage policy before handling real user recordings.
- **Browser local storage** is used for non-secret Audio Lab navigation state. Access tokens are held in memory, not local storage.

MongoDB is the intended persistent database for the Node backend. The Python README describes MongoDB with an in-memory fallback for local/demo operation.

## 10. Running Locally

Prerequisites depend on the chosen backend. The frontend needs Node.js/npm. The Node backend needs MongoDB and the provider credentials configured for the desired AI services. The Python backend needs Python 3.10+ and its packages; local Whisper may require additional model/runtime dependencies.

### Frontend

From the repository root:

```powershell
npm install
npm run dev
```

Vite prints the local frontend URL, normally `http://localhost:5173`.

### Node backend

In a separate terminal:

```powershell
cd backend
npm install
npm start
```

Configure `backend/.env` with the MongoDB connection and the AI provider keys/settings required by the selected transcription and LLM providers. Do not commit real secrets.

### Python backend (alternative)

In a separate terminal:

```powershell
cd backend-py
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --port 4000
```

Configure its `.env` as described by `backend-py/README.md`. Use this service with the current frontend only after resolving the request/response compatibility differences described above.

## 11. Where to Start Reading the Code

For a guided code walkthrough, follow this path:

1. `src/App.jsx` - application composition and routes
2. `src/pages/AudioLabPage.jsx` - user steps and results workspace
3. `src/context/LabContext.jsx` - upload, polling, history, and result state
4. `src/services/api.js` - frontend-to-backend API calls
5. `backend/src/index.js` - Node API initialization
6. `backend/src/routes/jobs.js` - upload, status, and result endpoints
7. `backend/src/services/agentPipeline.js` - Node processing flow
8. `backend/src/services/agents/` and `backend/src/services/evaluation/` - AI tasks and flowchart evaluation
9. `backend/src/db/` - database models and connection

For the Python implementation, start with `backend-py/app/main.py`, then follow its jobs route into `backend-py/app/services/orchestrator.py` and `backend-py/app/services/pipeline.py`.