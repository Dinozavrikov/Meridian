"""Схемы файловых вложений (EntityAttachment)."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class AttachmentOut(BaseModel):
    id:               int
    user_id:          int
    entity_type:      str
    entity_id:        int
    kind:             str
    filename:         str
    mime_type:        str
    size_bytes:       int
    language:         Optional[str] = None
    has_text_content: bool
    download_url:     str
    created_at:       datetime


class AttachmentDetailOut(AttachmentOut):
    text_content: Optional[str] = None


class AttachmentUploadOut(BaseModel):
    created: List[AttachmentOut]
    errors:  List[str]

class AttachmentTextReplace(BaseModel):
    text_content: str
    language: Optional[str] = None


class AttachmentVersionOut(BaseModel):
    id:               int
    attachment_id:    int
    filename:         str
    mime_type:        str
    size_bytes:       int
    language:         Optional[str] = None
    has_text_content: bool
    superseded_at:    datetime
    download_url:     str

