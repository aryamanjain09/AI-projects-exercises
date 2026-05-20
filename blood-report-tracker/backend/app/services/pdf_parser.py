import io
import logging
from dataclasses import dataclass, field
from typing import List, Optional

import pdfplumber

from app.services import claude_client
from app.services.claude_client import ClaudeExtractResult, ExtractedPanel

logger = logging.getLogger(__name__)


@dataclass
class ParseResult:
    report_date: Optional[str]       # YYYY-MM-DD or None
    lab_name: Optional[str]
    panels: List[ExtractedPanel]
    raw_text: str


async def parse_pdf(pdf_bytes: bytes) -> ParseResult:
    """
    Extracts text from a PDF using pdfplumber, then calls Claude to
    parse structured metric data from the text.

    Raises ValueError if the PDF appears to be image-based (no extractable text).
    """
    # Step 1: Extract text with pdfplumber
    raw_text = _extract_text(pdf_bytes)

    if not raw_text or not raw_text.strip():
        raise ValueError("PDF appears to be image-based and cannot be parsed")

    logger.info("Extracted %d characters of text from PDF", len(raw_text))

    # Step 2: Call Claude for structured extraction
    claude_result: ClaudeExtractResult = await claude_client.extract_metrics(raw_text)

    return ParseResult(
        report_date=claude_result.report_date,
        lab_name=claude_result.lab_name,
        panels=claude_result.panels,
        raw_text=raw_text,
    )


def _extract_text(pdf_bytes: bytes) -> str:
    """
    Synchronously extracts all text from a PDF using pdfplumber.
    Returns concatenated text from all pages.
    """
    pages_text: List[str] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            try:
                text = page.extract_text(x_tolerance=3, y_tolerance=3)
                if text:
                    pages_text.append(f"--- Page {page_num} ---\n{text}")
            except Exception as e:
                logger.warning("Failed to extract text from page %d: %s", page_num, e)

    return "\n\n".join(pages_text)
