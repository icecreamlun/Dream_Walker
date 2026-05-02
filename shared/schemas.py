from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class Structured(BaseModel):
    title: str
    summary: str
    characters: List[str] = []
    scenes: List[str] = []
    emotions: List[str] = []
    key_imagery: List[str] = []


class VisualBrief(BaseModel):
    color_palette: str
    pacing: str
    mood: str


class Divination(BaseModel):
    gua_name: str
    gua_meaning: str
    interpretation: str
    visual_brief: VisualBrief


class Dream(BaseModel):
    dream_id: str
    user_phone: str
    created_at: datetime
    raw_text: str
    structured: Structured
    divination: Optional[Divination] = None
    video_url: Optional[str] = None
    embedding: Optional[List[float]] = None


class ResonanceMatch(BaseModel):
    dream_id: str
    user_phone_masked: str
    title: str
    summary: str
    similarity: float
    created_at: datetime
