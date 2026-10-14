"""Pydantic models for request/response bodies and internal job state.

The public API response envelope ({ success, data, error }) and the job
status/result shapes are designed to match the existing React frontend
contract exactly so no UI changes are required.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------
# API envelope
# --------------------------------------------------------------------------
class ErrorDetail(BaseModel):
    message: str
    code: Optional[str] = None


class APIResponse(BaseModel):
    """Standard envelope returned by every endpoint."""

    success: bool = True
    data: Optional[Any] = None
    error: Optional[ErrorDetail] = None


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
class SignupRequest(BaseModel):
    fullName: str
    email: str
    password: str
    purpose: str = "Enterprise"


class LoginRequest(BaseModel):
    email: str
    password: str


class ProfileUpdateRequest(BaseModel):
    fullName: Optional[str] = None


class TokenData(BaseModel):
    userId: str
    email: str
    purpose: str = "Enterprise"
    isPro: bool = False


class UserPublic(BaseModel):
    id: str
    fullName: str
    email: str
    purpose: str
    isPro: bool = False


class AuthSuccess(BaseModel):
    accessToken: str
    user: UserPublic


# --------------------------------------------------------------------------
# Jobs
# --------------------------------------------------------------------------
class OutputType(str, Enum):
    MINDMAP = "mindmap"
    FLOWCHART = "flowchart"
    DASHBOARD = "dashboard"


class JobStage(str, Enum):
    PENDING = "pending"
    TRANSCRIBING = "transcribing"
    DIARIZING = "diarizing"
    ANALYZING = "analyzing"
    VISUALIZING = "visualizing"
    SUMMARIZING = "summarizing"
    COMPLETED = "completed"
    FAILED = "failed"


# Visual (mindmap / flowchart) node + edge shapes consumed by the SVG components.
class VisualNode(BaseModel):
    id: str
    label: str
    x: float
    y: float
    color: Optional[str] = None
    speaker: Optional[str] = None


class VisualEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    color: Optional[str] = None

    model_config = {"populate_by_name": True}


class Visual(BaseModel):
    type: str  # "mindmap" | "flowchart"
    mermaid: str = ""
    mermaidType: str = "flowchart"
    nodes: List[VisualNode] = Field(default_factory=list)
    edges: List[VisualEdge] = Field(default_factory=list)


# Dashboard shapes consumed by the Dashboard component.
class SpeakerStat(BaseModel):
    name: str
    talkTime: float = 0
    sentiment: str = "Neutral"


class TopicTag(BaseModel):
    label: str
    count: int = 1


class ActionItem(BaseModel):
    text: str
    speaker: str = ""
    done: bool = False


class TimelineSegment(BaseModel):
    label: str
    start: float = 0
    width: float = 0


class DashboardModel(BaseModel):
    summary: Dict[str, Any] = Field(default_factory=dict)
    speakers: List[SpeakerStat] = Field(default_factory=list)
    topics: List[TopicTag] = Field(default_factory=list)
    actions: List[ActionItem] = Field(default_factory=list)
    decisions: List[str] = Field(default_factory=list)
    timeline: List[TimelineSegment] = Field(default_factory=list)
    # Plotly figures (figures list) returned for the dashboard endpoint.
    plotly: Dict[str, Any] = Field(default_factory=dict)


class UploadResponse(BaseModel):
    jobId: str


class JobStatusResponse(BaseModel):
    jobId: str
    status: str
    completedStages: List[str] = Field(default_factory=list)
    transcript: Optional[str] = None
    diarization: Optional[Any] = None
    analysis: Optional[Any] = None
    visual: Optional[Any] = None
    summary: Optional[Any] = None
    error: Optional[str] = None


class JobResultResponse(BaseModel):
    jobId: str
    transcript: Optional[str] = None
    diarization: Optional[Any] = None
    analysis: Optional[Any] = None
    visual: Optional[Any] = None
    summary: Optional[Any] = None


# --------------------------------------------------------------------------
# Reports
# --------------------------------------------------------------------------
class ReportCreate(BaseModel):
    jobId: Optional[str] = None
    title: str
    outputType: str
    speakerCount: int = 1
    executiveSummary: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    visualData: Dict[str, Any]
    dashboardData: Optional[Dict[str, Any]] = None


class ReportPublic(BaseModel):
    id: str
    title: str
    outputType: str
    speakerCount: int
    executiveSummary: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    visualData: Dict[str, Any]
    dashboardData: Optional[Dict[str, Any]] = None
    isStarred: bool = False
    createdAt: datetime


class ReportList(BaseModel):
    reports: List[ReportPublic]
    pagination: Dict[str, Any]


# --------------------------------------------------------------------------
# Internal job document (stored in MongoDB)
# --------------------------------------------------------------------------
class JobDocument(BaseModel):
    jobId: str = Field(default_factory=lambda: uuid.uuid4().hex)
    userId: str
    outputType: str
    speakerCount: int
    fileName: Optional[str] = None
    fileSizeBytes: Optional[int] = None
    durationSeconds: Optional[float] = None
    status: str = JobStage.PENDING.value
    errorMessage: Optional[str] = None

    # Pipeline outputs
    agentTranscript: Optional[str] = None
    agentDiarization: Optional[Dict[str, Any]] = None
    agentAnalysis: Optional[Dict[str, Any]] = None
    agentVisual: Optional[Dict[str, Any]] = None
    agentSummary: Optional[Dict[str, Any]] = None

    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updatedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completedAt: Optional[datetime] = None

    def to_status(self) -> JobStatusResponse:
        completed_stages: List[str] = []
        if self.agentTranscript:
            completed_stages.append("transcribing")
        if self.agentDiarization:
            completed_stages.append("diarizing")
        if self.agentAnalysis:
            completed_stages.append("analyzing")
        if self.agentVisual:
            completed_stages.append("visualizing")
        if self.agentSummary:
            completed_stages.append("summarizing")
        return JobStatusResponse(
            jobId=self.jobId,
            status=self.status,
            completedStages=completed_stages,
            transcript=self.agentTranscript,
            diarization=self.agentDiarization,
            analysis=self.agentAnalysis,
            visual=self.agentVisual,
            summary=self.agentSummary,
            error=self.errorMessage,
        )

    def to_result(self) -> JobResultResponse:
        return JobResultResponse(
            jobId=self.jobId,
            transcript=self.agentTranscript,
            diarization=self.agentDiarization,
            analysis=self.agentAnalysis,
            visual=self.agentVisual,
            summary=self.agentSummary,
        )


# --------------------------------------------------------------------------
# Section 4: Audio Intelligence Analysis & Knowledge Tree MongoDB Models
# --------------------------------------------------------------------------
class SpeakerDetail(BaseModel):
    speaker_id: str
    speaker_name: str
    duration_seconds: float = 0.0
    word_count: int = 0
    key_topics: List[str] = Field(default_factory=list)
    influence_score: float = 5.0
    agreement_score: float = 0.8
    color_hex: str = "#FF6B6B"


class KnowledgeTreeNode(BaseModel):
    node_id: str
    label: str
    type: str  # concept | decision | action | metric | boundary | risk | milestone
    priority: int = 5
    confidence: float = 0.9
    primary_speaker_id: str = "speaker_1"
    mentioned_by_speakers: List[str] = Field(default_factory=list)
    x: float = 0.0
    y: float = 0.0
    width: float = 120.0
    height: float = 50.0
    metadata: Dict[str, Any] = Field(default_factory=dict)


class KnowledgeTreeEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    type: str  # causes | enables | relates-to | contradicts | supports | depends-on
    strength: float = 0.8
    label: str = "relates-to"
    cross_speaker: bool = False

    model_config = {"populate_by_name": True}


class KnowledgeTreeMetadata(BaseModel):
    root_topic: str = "Central Topic"
    max_depth: int = 1
    total_nodes: int = 0
    total_edges: int = 0
    confidence_score: float = 0.9


class KnowledgeTreePayload(BaseModel):
    metadata: KnowledgeTreeMetadata
    nodes: List[KnowledgeTreeNode] = Field(default_factory=list)
    edges: List[KnowledgeTreeEdge] = Field(default_factory=list)
    canvas: Dict[str, Any] = Field(default_factory=dict)


class ExportDetail(BaseModel):
    content: Optional[str] = None
    downloadUrl: Optional[str] = None
    size_bytes: int = 0
    dpi: Optional[int] = None
    quality: Optional[int] = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProcessingTimeBreakdown(BaseModel):
    transcription_ms: float = 0.0
    flow_agent_ms: float = 0.0
    speaker_agent_ms: float = 0.0
    metric_agent_ms: float = 0.0
    tree_generation_ms: float = 0.0
    export_ms: float = 0.0
    total_ms: float = 0.0


class AudioAnalysisDocument(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    userId: str
    audioFileId: Optional[str] = None
    originalFileName: str
    title: str = "Audio Analysis"
    summary: str = ""
    tags: List[str] = Field(default_factory=list)
    audioDuration: float = 0.0
    speakerCount: int = 1
    speakers: List[SpeakerDetail] = Field(default_factory=list)
    knowledgeTree: Optional[KnowledgeTreePayload] = None
    exports: Dict[str, ExportDetail] = Field(default_factory=dict)
    processingTime: ProcessingTimeBreakdown = Field(default_factory=ProcessingTimeBreakdown)
    status: str = "completed"
    error: Optional[str] = None
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updatedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

