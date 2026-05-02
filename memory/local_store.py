"""In-memory MemoryStore. O(N) cosine over a dict — N < 50 for demo, instant.

Two roles:
  1. Pre-workshop: Person A develops the webhook flow before HydraDB SDK arrives.
  2. Demo fallback: if HydraDB dies, MEMORY_BACKEND=local keeps the wow moment alive.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Dict, List, Optional

import numpy as np

from memory.store import MemoryStore
from shared.schemas import Dream, ResonanceMatch


def _cosine(a: List[float], b: List[float]) -> float:
    av = np.asarray(a, dtype=np.float32)
    bv = np.asarray(b, dtype=np.float32)
    denom = float(np.linalg.norm(av) * np.linalg.norm(bv))
    if denom == 0.0:
        return 0.0
    return float(np.dot(av, bv) / denom)


def _mask_phone(phone: str) -> str:
    if len(phone) < 6:
        return "+****"
    return f"{phone[:3]}****{phone[-2:]}"


class LocalMemoryStore(MemoryStore):
    def __init__(self) -> None:
        self._dreams: Dict[str, Dream] = {}

    def insert(self, dream: Dream) -> str:
        if dream.embedding is None:
            raise ValueError("Dream.embedding is required (call shared.embedding.embed first)")
        self._dreams[dream.dream_id] = dream
        return dream.dream_id

    def get(self, dream_id: str) -> Optional[Dream]:
        return self._dreams.get(dream_id)

    def list_by_user(self, user_phone: str, limit: int = 20) -> List[Dream]:
        matches = [d for d in self._dreams.values() if d.user_phone == user_phone]
        matches.sort(key=lambda d: d.created_at, reverse=True)
        return matches[:limit]

    def find_resonance(
        self,
        embedding: List[float],
        exclude_user: str,
        k: int = 3,
        within: Optional[timedelta] = None,
    ) -> List[ResonanceMatch]:
        # ────────────────────────────────────────────────────────────────
        # TODO(YOU): implement the resonance query — this is the demo's
        # high point ("2 strangers also dreamt of crossing water last night").
        #
        # Required behavior (also see docstring in memory/store.py):
        #   1. Iterate self._dreams.values()
        #   2. Skip d.user_phone == exclude_user
        #   3. If `within` is set, prefer dreams whose created_at is within
        #      that window from now (UTC).
        #   4. Score each candidate with _cosine(embedding, d.embedding)
        #   5. Sort by similarity desc, take top-k
        #   6. **Fallback**: if step 3 narrows results to 0, retry WITHOUT
        #      the time filter — never return empty if any non-self dreams
        #      exist (the demo's wow moment must always have content).
        #   7. Wrap each into a ResonanceMatch (use _mask_phone for privacy).
        #
        # ~10-15 lines. The product-shaping bit is step 6 (the fallback) —
        # think about whether you'd ever want to return empty intentionally.
        # ────────────────────────────────────────────────────────────────
        raise NotImplementedError("See TODO above — Person to fill in")
