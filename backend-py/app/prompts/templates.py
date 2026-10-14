"""Prompt templates for the multi-agent pipeline.

Prompts instruct the LLM to return strict JSON. When no LLM key is present,
the LLM client falls back to deterministic generators, so these prompts also
serve as specifications for the expected output schema.
"""

from __future__ import annotations

FLOW_PROMPT = """Analyze this transcript and extract a hierarchical structure of key points.
For each point, classify it as one of: concept, decision, action, metric, boundary, risk, or milestone.
Identify which speaker introduced the point and which speakers mentioned it.
Rate priority (1-10) based on emphasis and importance.
Output as JSON with nodes and edges (avoid Mermaid format).
Keep temperature=0.2 for consistency.

Return ONLY JSON with this exact schema:
{
  "rootTopic": "Main Central Title",
  "summary": "Concise 2 sentence summary",
  "nodes": [
    {
      "id": "node_1",
      "label": "Short label (<= 6 words)",
      "type": "concept|decision|action|metric|boundary|risk|milestone",
      "priority": 8,
      "confidence": 0.95,
      "primary_speaker": "speaker_1",
      "mentioned_by_speakers": ["speaker_1", "speaker_2"],
      "parent": null
    }
  ],
  "edges": [
    {
      "from": "node_1",
      "to": "node_2",
      "type": "causes|enables|relates-to|contradicts|supports|depends-on",
      "strength": 0.9,
      "label": "causes",
      "cross_speaker": false
    }
  ]
}

Speaker Metadata:
<<<SPEAKER_METADATA>>>

Transcript:
\"\"\"
<<<TRANSCRIPT>>>
\"\"\"
"""

SPEAKER_PROMPT = """Analyze speaker dynamics in this transcript.
For each speaker, identify:
1. Key topics they emphasized
2. How often others referenced their ideas
3. Areas of agreement with other speakers
4. Areas of disagreement
5. Influence on decision-making
Output as JSON with speaker relationships and consensus/conflict markers.

Return ONLY JSON with this schema:
{
  "speakers": [
    {
      "speaker_id": "speaker_1",
      "speaker_name": "Speaker Name",
      "key_topics": ["topic1", "topic2"],
      "influence_score": 8.5,
      "agreement_score": 0.85
    }
  ],
  "agreements": [
    {"speakers": ["speaker_1", "speaker_2"], "topic": "Q3 Target", "score": 0.9}
  ],
  "conflicts": [
    {"speakers": ["speaker_1", "speaker_2"], "topic": "Timeline", "score": -0.4}
  ],
  "nodeSpeakerMapping": {
    "node_1": "speaker_1"
  }
}

Transcript:
\"\"\"
<<<TRANSCRIPT>>>
\"\"\"
"""

METRIC_SUMMARY_PROMPT = """Extract all metrics and produce executive summary.
Extract metrics with name, numerical value, unit, mentioned speaker, and context.
Provide a 1-3 word title, maximum 2-sentence executive summary, 3-5 taxonomy tags, and critical decision points.

Return ONLY JSON with this schema:
{
  "title": "Q3 Budget Review",
  "executiveSummary": "Team agreed on Q3 budget targets and milestone timelines.",
  "tags": ["budget", "timeline", "q3"],
  "decisionPoints": ["Prioritize enterprise feature set"],
  "metrics": [
    {
      "metric_name": "Q3 Budget",
      "value": 250000,
      "unit": "USD",
      "mentioned_by_speaker": "Speaker 1",
      "context_node": "node_1"
    }
  ],
  "series": [{"label": "Q1", "value": 250000}],
  "timeline": [{"label": "Kickoff", "value": 0}]
}

Transcript:
\"\"\"
<<<TRANSCRIPT>>>
\"\"\"
"""

VALIDATION_PROMPT = """You are the AuraSync Validation Agent.

You are given a Mermaid diagram string. Validate its syntax.
If it is invalid, repair it so it becomes valid Mermaid.
Never return broken Mermaid code.

Return ONLY JSON:
{
  "valid": boolean,
  "mermaid": "<valid mermaid string>",
  "mermaidType": "flowchart" | "mindmap",
  "repaired": boolean
}

Mermaid to validate:
\"\"\"
<<<MERMAID>>>
\"\"\"
"""

SUMMARY_PROMPT = """You are the AuraSync Summary Agent.

Produce a concise executive summary (2 sentences max) and 3-5 tags for the analyzed discussion.

Return ONLY JSON:
{
  "title": "Short Title (1-3 words)",
  "executiveSummary": "Max 2 sentence executive summary.",
  "tags": ["tag1", "tag2", "tag3"]
}

Transcript:
\"\"\"
<<<TRANSCRIPT>>>
\"\"\"
"""


def render(prompt: str, **values: str) -> str:
    """Inject values into a prompt template via token replacement.

    Avoids str.format so the JSON braces inside prompts are preserved.
    """

    for key, value in values.items():
        prompt = prompt.replace(f"<<<{key.upper()}>>>", str(value))
    return prompt
