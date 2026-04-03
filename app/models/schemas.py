from pydantic import BaseModel


class TemplateUploadResponse(BaseModel):
    session_id: str
    header_row: int
    leading_blank_rows: int
    leading_blank_cols: int
    column_names: list[str]


class ConvertResponse(BaseModel):
    download_url: str
    filename: str
    warnings: list[str]
