"""Comprehensive test suite for Audio Intelligence Knowledge Tree generation.

Tests:
- Speaker diarization & metadata extraction
- Parallel multi-agent pipeline (Flow, Speaker, Metric)
- Knowledge Tree layout algorithm (dynamic positions, shapes, curves)
- Multi-format Export Engine (SVG, PNG, JPG, PDF)
- FastAPI end-to-end endpoint execution
"""

from __future__ import annotations

import asyncio
import io
import os
import sys
import tempfile
import time
import unittest

from fastapi.testclient import TestClient

from app.agents.assembler import layout_knowledge_tree
from app.agents.flow_agent import run_flow_agent
from app.agents.metric_agent import run_metric_agent
from app.agents.speaker_agent import run_speaker_agent
from app.audio.diarization import analyze_speakers
from app.main import app
from app.services.export_service import export_service
from app.services.pipeline import run_audio_intelligence_pipeline

TEST_TRANSCRIPT = """Speaker 1: Welcome to the Q3 Strategic Planning Sync.
Speaker 2: Let's review our primary revenue target of 450000 USD for this quarter.
Speaker 1: The allocated budget is 120000 USD across marketing and engineering.
Speaker 2: We must reach 75% completion of our roadmap by the end of Q3.
Speaker 1: Decision: We will prioritize enterprise feature development over acquisition.
Speaker 2: Action: Speaker 2 will finalize the operating plan by Friday.
Speaker 1: Note that the risk register currently lists 4 open items to monitor.
Speaker 2: Milestone: Q3 rollout targets completion by late September."""


class TestAudioTreeIntelligence(unittest.TestCase):
    def test_speaker_diarization(self):
        speakers = analyze_speakers(
            TEST_TRANSCRIPT,
            speaker_count=2,
            speaker_labels={"Speaker 1": "Alice", "Speaker 2": "Bob"},
            total_duration_seconds=300.0,
        )
        self.assertEqual(len(speakers), 2)
        self.assertIn("speaker_id", speakers[0])
        self.assertEqual(speakers[0]["speaker_name"], "Alice")
        self.assertEqual(speakers[1]["speaker_name"], "Bob")
        self.assertGreater(speakers[0]["duration_seconds"], 0)
        self.assertIn("#", speakers[0]["color_hex"])

    def test_parallel_agents_execution(self):
        async def _run():
            speakers = analyze_speakers(TEST_TRANSCRIPT, speaker_count=2)
            flow = await run_flow_agent(TEST_TRANSCRIPT, speakers=speakers)
            spk_analysis = await run_speaker_agent(TEST_TRANSCRIPT, speakers=speakers)
            metrics = await run_metric_agent(TEST_TRANSCRIPT)

            self.assertIn("nodes", flow)
            self.assertIn("edges", flow)
            self.assertGreater(len(flow["nodes"]), 0)
            self.assertIn("agreement_matrix", spk_analysis)
            self.assertIn("metrics", metrics)

        asyncio.run(_run())

    def test_knowledge_tree_layout(self):
        speakers = analyze_speakers(TEST_TRANSCRIPT, speaker_count=2)
        nodes = [
            {"id": "n1", "label": "Root", "type": "boundary", "primary_speaker": "speaker_1", "parent": None},
            {"id": "n2", "label": "Revenue Target", "type": "metric", "primary_speaker": "speaker_2", "parent": "n1"},
            {"id": "n3", "label": "Prioritize Enterprise", "type": "decision", "primary_speaker": "speaker_1", "parent": "n1"},
        ]
        edges = [
            {"from": "n1", "to": "n2", "type": "relates-to", "cross_speaker": True},
            {"from": "n1", "to": "n3", "type": "causes", "cross_speaker": False},
        ]
        tree = layout_knowledge_tree(nodes, edges, speakers, root_topic="Planning")
        self.assertIn("canvas", tree)
        self.assertEqual(len(tree["nodes"]), 3)
        self.assertGreater(tree["nodes"][0]["x"], 0)
        self.assertGreater(tree["nodes"][0]["y"], 0)

    def test_export_engine_multi_format(self):
        speakers = analyze_speakers(TEST_TRANSCRIPT, speaker_count=2)
        nodes = [
            {"id": "n1", "label": "Root", "type": "concept", "primary_speaker": "speaker_1", "parent": None},
            {"id": "n2", "label": "Metric Node", "type": "metric", "primary_speaker": "speaker_2", "parent": "n1"},
        ]
        edges = [{"from": "n1", "to": "n2", "type": "enables", "cross_speaker": True}]
        tree = layout_knowledge_tree(nodes, edges, speakers, root_topic="Test Tree")

        exports = export_service.export_all_formats(
            tree=tree,
            speakers=speakers,
            title="Test Tree",
            requested_formats=["svg", "png", "jpg", "pdf"],
        )

        self.assertIn("svg", exports)
        self.assertIn("<svg", exports["svg"]["content"])
        self.assertIn("png", exports)
        self.assertIn("downloadUrl", exports["png"])
        self.assertIn("jpg", exports)
        self.assertIn("pdf", exports)

    def test_fastapi_endpoints(self):
        client = TestClient(app)

        import struct
        num_samples = 16000
        data = b"".join(struct.pack("<h", int(1000 * (i % 20))) for i in range(num_samples))
        data_size = len(data)
        file_size = 36 + data_size

        wav_bytes = (
            b"RIFF" + file_size.to_bytes(4, "little") + b"WAVE" +
            b"fmt " + (16).to_bytes(4, "little") + (1).to_bytes(2, "little") +
            (1).to_bytes(2, "little") + (16000).to_bytes(4, "little") +
            (32000).to_bytes(4, "little") + (2).to_bytes(2, "little") +
            (16).to_bytes(2, "little") + b"data" + data_size.to_bytes(4, "little") +
            data
        )

        response = client.post(
            "/api/audio/analyze-and-generate-tree",
            files={"audio_file": ("test.wav", wav_bytes, "audio/wav")},
            data={
                "export_formats": "png,svg,pdf,jpg",
                "speaker_labels": '{"Speaker 1": "Alice", "Speaker 2": "Bob"}',
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("analysis", data)
        self.assertIn("knowledgeTree", data["analysis"])
        self.assertIn("exports", data)
        self.assertIn("svg", data["exports"])

        analysis_id = data["analysisId"]

        # Poll status endpoint
        poll_res = client.get(f"/api/audio/analyses/{analysis_id}")
        self.assertEqual(poll_res.status_code, 200)

        # Download export file endpoint
        exp_res = client.get(f"/api/audio/{analysis_id}/export/svg")
        self.assertEqual(exp_res.status_code, 200)
        self.assertIn("image/svg+xml", exp_res.headers["content-type"])


if __name__ == "__main__":
    unittest.main()
