import io

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

from app.core.session_store import SourceFileMeta, TemplateMetadata
from app.models.schemas import ColumnMapping


def _clear_data_rows(ws: Worksheet, header_row: int) -> None:
    """Set all cell values below the header row to None (preserves cell styles)."""
    if not ws.max_row or not ws.max_column:
        return
    for row in ws.iter_rows(min_row=header_row + 1):
        for cell in row:
            cell.value = None


def convert_with_mapping(
    source_file_meta: SourceFileMeta,
    source_bytes: bytes,
    template_meta: TemplateMetadata,
    mapping: list[ColumnMapping],
) -> tuple[bytes, list[str]]:
    """
    Convert one source file to the template structure using the provided mapping.

    - Source is loaded in read_only mode for memory-efficient handling of large files.
    - Template is loaded fresh each time so all styles, column widths, freeze panes,
      and other formatting are preserved in the output.
    - Extra columns (is_extra=True) are appended after the template columns.

    Returns (output_xlsx_bytes, warnings).
    """
    # Load template fresh — inherits all styles/widths/formatting
    out_wb = load_workbook(io.BytesIO(template_meta.template_wb_bytes))
    out_ws = out_wb.active
    if out_ws is None:
        raise ValueError("Template workbook has no active sheet")

    # Clear any sample data rows that may exist in the template
    _clear_data_rows(out_ws, template_meta.header_row)

    # Write extra column headers beyond the template's own columns
    extra_mappings = [m for m in mapping if m.is_extra]
    if extra_mappings:
        extra_start_col = template_meta.header_col_start + len(template_meta.column_names)
        for i, m in enumerate(extra_mappings):
            out_ws.cell(
                row=template_meta.header_row,
                column=extra_start_col + i,
            ).value = m.output_col

    # Load source in read_only mode — does not load all rows into memory at once
    src_wb = load_workbook(io.BytesIO(source_bytes), data_only=True, read_only=True)
    src_ws = src_wb.active
    if src_ws is None:
        src_wb.close()
        raise ValueError("Source workbook has no active sheet")

    col_to_idx = source_file_meta.col_name_to_row_index
    out_row = template_meta.header_row + 1
    warnings: list[str] = []

    try:
        # iter_rows in read_only mode is a generator — rows are never all in memory
        for src_row in src_ws.iter_rows(
            min_row=source_file_meta.header_row + 1,
            values_only=True,
        ):
            # Skip entirely blank rows
            if not any(v is not None for v in src_row):
                continue

            for col_offset, col_map in enumerate(mapping):
                out_col = template_meta.header_col_start + col_offset
                if col_map.source_col is None:
                    value = None
                else:
                    idx = col_to_idx.get(col_map.source_col)
                    value = (
                        src_row[idx]
                        if idx is not None and idx < len(src_row)
                        else None
                    )
                out_ws.cell(row=out_row, column=out_col).value = value

            out_row += 1
    finally:
        src_wb.close()

    buf = io.BytesIO()
    out_wb.save(buf)
    buf.seek(0)
    return buf.read(), warnings
