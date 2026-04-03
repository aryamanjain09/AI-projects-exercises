from typing import Optional

from pydantic import BaseModel


class TemplateUploadResponse(BaseModel):
    session_id: str
    header_row: int
    leading_blank_rows: int
    leading_blank_cols: int
    column_names: list[str]


class ColumnMapping(BaseModel):
    output_col: str
    source_col: Optional[str] = None
    is_extra: bool = False


class SourceGroupResponse(BaseModel):
    group_id: str
    file_names: list[str]
    source_columns: list[str]
    mapping: list[ColumnMapping]


class PreviewResponse(BaseModel):
    groups: list[SourceGroupResponse]


class GroupMappingRequest(BaseModel):
    group_id: str
    mapping: list[ColumnMapping]


class ConvertRequest(BaseModel):
    session_id: str
    mappings: list[GroupMappingRequest]


class ConvertResponse(BaseModel):
    download_url: str
    filename: str
    warnings: list[str]
