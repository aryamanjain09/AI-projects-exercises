import io
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl.utils.exceptions import InvalidFileException

from app.core import session_store
from app.core.converter import convert
from app.core.template_parser import parse_template
from app.models.schemas import ConvertResponse, TemplateUploadResponse

router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = (".xlsx", ".xlsm")

# Short-lived store for converted output files (single-use download)
_output_store: dict[str, tuple[bytes, str]] = {}  # file_id -> (bytes, filename)


def _check_file(file: UploadFile) -> None:
    filename = file.filename or ""
    if not any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Only .xlsx / .xlsm files are accepted")


async def _read_limited(file: UploadFile) -> bytes:
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
    return data


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


@router.post("/api/convert", response_model=ConvertResponse)
async def convert_file(
    file: UploadFile = File(...),
    session_id: str = Form(...),
):
    _check_file(file)
    session_store.evict_expired()

    meta = session_store.get(session_id)
    if meta is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found or expired. Please re-upload the template.",
        )

    data = await _read_limited(file)

    try:
        output_bytes, warnings = convert(data, meta)
    except InvalidFileException:
        raise HTTPException(status_code=400, detail="Invalid or corrupted source Excel file")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {e}")

    file_id = str(uuid.uuid4())
    source_stem = (file.filename or "converted").rsplit(".", 1)[0]
    output_filename = f"{source_stem}_converted.xlsx"
    _output_store[file_id] = (output_bytes, output_filename)

    return ConvertResponse(
        download_url=f"/download/{file_id}",
        filename=output_filename,
        warnings=warnings,
    )


@router.get("/download/{file_id}")
async def download_file(file_id: str):
    entry = _output_store.pop(file_id, None)
    if entry is None:
        raise HTTPException(status_code=404, detail="File not found or already downloaded")

    output_bytes, filename = entry
    return StreamingResponse(
        io.BytesIO(output_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
