import io
import uuid
import zipfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl.utils.exceptions import InvalidFileException

from app.core import session_store
from app.core.converter import convert_with_mapping
from app.core.source_parser import auto_map, parse_source_files
from app.core.template_parser import parse_template
from app.models.schemas import (
    ConvertRequest,
    ConvertResponse,
    PreviewResponse,
    SourceGroupResponse,
    TemplateUploadResponse,
)

router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB — raised to support large files
ALLOWED_EXTENSIONS = (".xlsx", ".xlsm")

# Short-lived store for converted output files (single-use download)
_output_store: dict[str, tuple[bytes, str]] = {}


def _check_file(file: UploadFile) -> None:
    filename = file.filename or ""
    if not any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Only .xlsx / .xlsm files are accepted")


async def _read_limited(file: UploadFile) -> bytes:
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_FILE_SIZE // (1024 * 1024)} MB limit",
        )
    return data


# ── Template upload ───────────────────────────────────────────────────────────

@router.post("/api/template", response_model=TemplateUploadResponse)
async def upload_template(file: UploadFile = File(...)):
    _check_file(file)
    data = await _read_limited(file)
    try:
        meta = parse_template(data)
    except InvalidFileException:
        raise HTTPException(status_code=400, detail="Invalid or corrupted Excel file")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    session_store.put(meta)

    return TemplateUploadResponse(
        session_id=meta.session_id,
        header_row=meta.header_row,
        leading_blank_rows=meta.leading_blank_rows,
        leading_blank_cols=meta.leading_blank_cols,
        column_names=meta.column_names,
    )


# ── Preview mapping ───────────────────────────────────────────────────────────

@router.post("/api/preview", response_model=PreviewResponse)
async def preview_mapping(
    session_id: str = Form(...),
    files: list[UploadFile] = File(...),
):
    """
    Upload one or more source files. Returns detected groups and auto-generated
    column mapping for user review. Files with identical header sets are grouped.
    """
    session_store.evict_expired()
    meta = session_store.get(session_id)
    if meta is None:
        raise HTTPException(
            status_code=404,
            detail="Template session not found or expired. Please re-upload the template.",
        )

    file_data: list[tuple[bytes, str]] = []
    for f in files:
        _check_file(f)
        data = await _read_limited(f)
        file_data.append((data, f.filename or "unknown.xlsx"))

    try:
        groups = parse_source_files(file_data)
    except InvalidFileException:
        raise HTTPException(
            status_code=400,
            detail="One or more source files are invalid or corrupted",
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    for group in groups:
        session_store.put_source_group(group)

    return PreviewResponse(
        groups=[
            SourceGroupResponse(
                group_id=group.group_id,
                file_names=[f.filename for f in group.files],
                source_columns=group.source_columns,
                mapping=auto_map(meta.column_names, group.source_columns),
            )
            for group in groups
        ]
    )


# ── Convert with mapping ──────────────────────────────────────────────────────

@router.post("/api/convert", response_model=ConvertResponse)
async def convert_files(body: ConvertRequest):
    """
    Convert all source files using the provided column mappings.
    Returns a single .xlsx if one file, or a .zip if multiple.
    """
    session_store.evict_expired()
    meta = session_store.get(body.session_id)
    if meta is None:
        raise HTTPException(
            status_code=404,
            detail="Template session not found or expired. Please re-upload the template.",
        )

    all_results: list[tuple[str, bytes]] = []
    all_warnings: list[str] = []

    for group_req in body.mappings:
        group = session_store.get_source_group(group_req.group_id)
        if group is None:
            raise HTTPException(
                status_code=404,
                detail="Source group not found or expired. Please re-upload source files.",
            )

        for file_meta in group.files:
            source_bytes = session_store.get_source_bytes(file_meta.bytes_key)
            if source_bytes is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Source file '{file_meta.filename}' data expired. Please re-upload.",
                )

            try:
                out_bytes, warnings = convert_with_mapping(
                    file_meta, source_bytes, meta, group_req.mapping
                )
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Conversion failed for '{file_meta.filename}': {e}",
                )

            stem = file_meta.filename.rsplit(".", 1)[0]
            all_results.append((f"{stem}_converted.xlsx", out_bytes))
            all_warnings.extend(warnings)

    if not all_results:
        raise HTTPException(status_code=400, detail="No files to convert")

    file_id = str(uuid.uuid4())

    if len(all_results) == 1:
        filename, out_bytes = all_results[0]
        _output_store[file_id] = (out_bytes, filename)
        return ConvertResponse(
            download_url=f"/download/{file_id}",
            filename=filename,
            warnings=all_warnings,
        )
    else:
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # Handle duplicate filenames
            seen: dict[str, int] = {}
            for filename, out_bytes in all_results:
                if filename in seen:
                    seen[filename] += 1
                    base, ext = filename.rsplit(".", 1)
                    filename = f"{base}_{seen[filename]}.{ext}"
                else:
                    seen[filename] = 0
                zf.writestr(filename, out_bytes)
        zip_buf.seek(0)
        _output_store[file_id] = (zip_buf.read(), "converted_files.zip")
        return ConvertResponse(
            download_url=f"/download/{file_id}",
            filename="converted_files.zip",
            warnings=all_warnings,
        )


# ── Download ──────────────────────────────────────────────────────────────────

@router.get("/download/{file_id}")
async def download_file(file_id: str):
    entry = _output_store.pop(file_id, None)
    if entry is None:
        raise HTTPException(status_code=404, detail="File not found or already downloaded")

    out_bytes, filename = entry
    is_zip = filename.endswith(".zip")
    media_type = (
        "application/zip"
        if is_zip
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return StreamingResponse(
        io.BytesIO(out_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
