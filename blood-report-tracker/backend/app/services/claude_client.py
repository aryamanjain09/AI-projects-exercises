import json
import logging
from typing import List, Optional

import anthropic
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class ExtractedMetric(BaseModel):
    raw_name: str
    value: float
    unit: Optional[str] = None
    ref_range_low: Optional[float] = None
    ref_range_high: Optional[float] = None
    ref_range_text: Optional[str] = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class ExtractedPanel(BaseModel):
    panel_name: str
    metrics: List[ExtractedMetric]


class ClaudeExtractResult(BaseModel):
    report_date: Optional[str] = None  # YYYY-MM-DD or null
    lab_name: Optional[str] = None
    panels: List[ExtractedPanel] = Field(default_factory=list)


# ─── Claude Client ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a medical data extraction specialist. Your task is to extract all blood test metrics from a lab report text and return them as structured JSON.

Follow these rules strictly:
1. Group all metrics by their panel (e.g., "CBC", "Lipid Profile", "Liver Function", "Thyroid Function", "Kidney Function", "Electrolytes", "Diabetes", "Iron Studies", "Vitamins", "Coagulation", "Urinalysis", "Hormones", "Inflammatory Markers", "Other").
2. Extract the exact numeric value. If a value is a range (e.g., ">5"), represent the numeric part.
3. Parse reference ranges into ref_range_low and ref_range_high when available as numbers. Store the original text in ref_range_text.
4. Set confidence to a value between 0.0 and 1.0:
   - 1.0 for clearly readable, unambiguous values with explicit units and ranges
   - 0.7-0.84 for values that are ambiguous (unclear unit, smudged text, unusual format, conflicting data)
   - <0.7 for very uncertain extractions
   - Set confidence < 0.85 for ANY ambiguous value, unit, or reference range
5. Return report_date as YYYY-MM-DD format, or null if not found.
6. Return lab_name as a string, or null if not found.
7. Do NOT invent values — only extract what is explicitly present in the text.

Return ONLY valid JSON matching this exact schema, with no additional text or markdown:

{
  "report_date": "YYYY-MM-DD or null",
  "lab_name": "string or null",
  "panels": [
    {
      "panel_name": "string",
      "metrics": [
        {
          "raw_name": "exact name from report",
          "value": number,
          "unit": "string or null",
          "ref_range_low": number_or_null,
          "ref_range_high": number_or_null,
          "ref_range_text": "original range string or null",
          "confidence": 0.0_to_1.0
        }
      ]
    }
  ]
}"""


async def extract_metrics(text: str) -> ClaudeExtractResult:
    """
    Calls Claude API to extract structured metric data from lab report text.
    Returns a ClaudeExtractResult with panels and metrics.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    try:
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"Extract all blood test metrics from the following lab report text:\n\n{text}",
                }
            ],
        )

        response_text = message.content[0].text.strip()

        # Strip markdown code fences if present
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            # Remove first and last fence lines
            response_text = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])

        parsed = json.loads(response_text)
        return ClaudeExtractResult.model_validate(parsed)

    except json.JSONDecodeError as e:
        logger.error("Failed to parse Claude JSON response: %s", e)
        logger.debug("Raw Claude response: %s", response_text if "response_text" in dir() else "N/A")
        # Return empty result rather than crashing the worker
        return ClaudeExtractResult(report_date=None, lab_name=None, panels=[])

    except anthropic.APIError as e:
        logger.error("Anthropic API error: %s", e)
        raise RuntimeError(f"Claude API error: {e}") from e
