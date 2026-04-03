import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

TTL_SECONDS = 3600  # 1 hour


# ── Template sessions ─────────────────────────────────────────────────────────

@dataclass
class TemplateMetadata:
    session_id: str
    leading_blank_rows: int
    leading_blank_cols: int
    header_row: int
    header_col_start: int
    column_names: list[str]
    template_wb_bytes: bytes
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
    # Also evict source data older than TTL
    expired_bytes = [k for k, (_, ts) in _source_bytes.items() if now - ts > TTL_SECONDS]
    for k in expired_bytes:
        del _source_bytes[k]
    expired_groups = [gid for gid, (_, ts) in _source_groups.items() if now - ts > TTL_SECONDS]
    for gid in expired_groups:
        del _source_groups[gid]


def new_session_id() -> str:
    return str(uuid.uuid4())


# ── Source file & group storage ───────────────────────────────────────────────

@dataclass
class SourceFileMeta:
    file_id: str
    filename: str
    source_columns: list[str]               # ordered header names as found
    col_name_to_row_index: dict[str, int]   # col_name -> 0-based index in row tuple
    header_row: int
    bytes_key: str                          # key into _source_bytes


@dataclass
class SourceGroupMeta:
    group_id: str
    files: list[SourceFileMeta]
    source_columns: list[str]  # canonical ordered column list for this group


# (bytes, created_at)
_source_bytes: dict[str, tuple[bytes, float]] = {}
# (group, created_at)
_source_groups: dict[str, tuple[SourceGroupMeta, float]] = {}


def put_source_bytes(bytes_key: str, data: bytes) -> None:
    _source_bytes[bytes_key] = (data, time.time())


def get_source_bytes(bytes_key: str) -> Optional[bytes]:
    entry = _source_bytes.get(bytes_key)
    return entry[0] if entry else None


def put_source_group(group: SourceGroupMeta) -> None:
    _source_groups[group.group_id] = (group, time.time())


def get_source_group(group_id: str) -> Optional[SourceGroupMeta]:
    entry = _source_groups.get(group_id)
    return entry[0] if entry else None
