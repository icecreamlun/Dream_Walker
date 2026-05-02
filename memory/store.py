"""MemoryStore interface — implemented by LocalMemoryStore and HydraDBMemoryStore.

Shaped by the demo's two queries:
  1. Personal:  list_by_user(user_phone)        — "show MY dreams"
  2. Resonance: find_resonance(emb, exclude=me) — "who else dreamt this"
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import timedelta
from typing import List, Optional

from shared.schemas import Dream, ResonanceMatch


class MemoryStore(ABC):
    @abstractmethod
    def insert(self, dream: Dream) -> str: ...

    @abstractmethod
    def get(self, dream_id: str) -> Optional[Dream]: ...

    @abstractmethod
    def list_by_user(self, user_phone: str, limit: int = 20) -> List[Dream]: ...

    @abstractmethod
    def find_resonance(
        self,
        embedding: List[float],
        exclude_user: str,
        k: int = 3,
        within: Optional[timedelta] = None,
    ) -> List[ResonanceMatch]:
        """Top-k similar dreams from OTHER users.

        within: optional time window. If the windowed query returns 0,
        implementations MUST fall back to no-time-filter so the demo's
        "2 strangers also dreamt this" moment never shows empty.
        """
