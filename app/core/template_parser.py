import io

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

from app.core.session_store import TemplateMetadata, new_session_id


def count_leading_blank_rows(ws: Worksheet) -> int:
    """Count all-blank rows at the top before the first row with any value."""
    for row_idx, row in enumerate(ws.iter_rows(), start=1):
        if any(cell.value is not None for cell in row):
            return row_idx - 1
    return ws.max_row or 0


def count_leading_blank_cols(ws: Worksheet, start_row: int) -> int:
    """
    Count leading blank columns, measured from start_row downward.
    A column is "leading blank" if it has no non-None value at or below start_row.
    """
    max_col = ws.max_column or 0
    for col_idx in range(1, max_col + 1):
        for row_idx in range(start_row, (ws.max_row or 0) + 1):
            if ws.cell(row=row_idx, column=col_idx).value is not None:
                return col_idx - 1
    return max_col


def read_headers(ws: Worksheet, header_row: int, leading_blank_cols: int) -> list[str]:
    """
    Read consecutive non-empty cells starting at (header_row, leading_blank_cols+1).
    Returns ordered list of header strings.
    Raises ValueError on duplicate headers.
    """
    headers: list[str] = []
    col = leading_blank_cols + 1
    max_col = ws.max_column or 0
    while col <= max_col:
        val = ws.cell(row=header_row, column=col).value
        if val is None:
            break
        headers.append(str(val))
        col += 1
    if len(headers) != len(set(headers)):
        raise ValueError("Template has duplicate column header names")
    return headers


def parse_template(file_bytes: bytes) -> TemplateMetadata:
    """
    Parse a template .xlsx file and extract structural metadata.
    Operates on the active (first) sheet only.
    """
    wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active

    if ws is None or ws.max_row is None or ws.max_column is None:
        raise ValueError("Template sheet has no data")

    blank_rows = count_leading_blank_rows(ws)
    header_row = blank_rows + 1

    if header_row > (ws.max_row or 0):
        raise ValueError("Template sheet has no data")

    blank_cols = count_leading_blank_cols(ws, header_row)
    columns = read_headers(ws, header_row, blank_cols)

    if not columns:
        raise ValueError("Template sheet has no column headers")

    return TemplateMetadata(
        session_id=new_session_id(),
        leading_blank_rows=blank_rows,
        leading_blank_cols=blank_cols,
        header_row=header_row,
        header_col_start=blank_cols + 1,
        column_names=columns,
        template_wb_bytes=file_bytes,
    )
