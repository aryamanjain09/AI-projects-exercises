import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

TTL_SECONDS = 3600  # sessions expire after 1 hour


@dataclass
class TemplateMetadata:
    session_id: str
    leading_blank_rows: int      # rows 1..N are entirely blank
    leading_blank_cols: int      # cols 1..M are entirely blank
    header_row: int              # 1-based absolute row index of headers
    header_col_start: int        # 1-based absolute col index of first header
    column_names: list[str]      # ordered header names from template
    template_wb_bytes: bytes     # raw .xlsx bytes for style-preserving conversion
    created_at: float = field(default_factory=time.time)


_store: dict[str, TemplateMetadata] = {}


def put(meta: TemplateMetadata) -> None:
    _store[meta.session_id] = meta


def get(session_id: str) -> Optional[TemplateMetadata]:
    return _store.get(session_id)


def evict_expired() -> None:
    now = time.time()
    expired = [sid for sid, m in _store.items() if now - m.created_at > TTL_SECONDS]
    for sid in expired:
        del _store[sid]


def new_session_id() -> str:
    return str(uuid.uuid4())
