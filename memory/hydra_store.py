"""HydraDBMemoryStore — TODO: fill in after morning workshop with Harnoor.

Until then, MEMORY_BACKEND=local routes to LocalMemoryStore (same interface).

Expected SDK shape (Pinecone-style guess, adapt once SDK is in hand):
    client = HydraClient(api_key=..., base_url=...)
    client.upsert(namespace, [{id, vector, metadata}])
    client.query(namespace, vector, top_k, filter={"user_phone": {"$ne": ...}})
    client.fetch(namespace, ids=[...])

Metadata schema (kept small to fit vector-DB metadata limits):
    user_phone, created_at, title, summary, key_imagery, gua_name
Long fields (raw_text, divination.interpretation, video_url) — decide at
workshop whether to fit into metadata or sidecar in a local SQLite map.
"""
from __future__ import annotations

import os
from datetime import timedelta
from typing import List, Optional

from memory.store import MemoryStore
from shared.schemas import Dream, ResonanceMatch


class HydraDBMemoryStore(MemoryStore):
    def __init__(self) -> None:
        self.api_key = os.getenv("HYDRA_API_KEY")
        self.base_url = os.getenv("HYDRA_BASE_URL")
        self.namespace = os.getenv("HYDRA_NAMESPACE", "dream_walker")
        if not self.api_key or not self.base_url:
            raise RuntimeError("HYDRA_API_KEY and HYDRA_BASE_URL must be set")
        # TODO: from hydra_sdk import HydraClient  (real package name TBD)
        # self.client = HydraClient(api_key=self.api_key, base_url=self.base_url)
        raise NotImplementedError("Fill in after workshop — see module docstring")

    def insert(self, dream: Dream) -> str:
        raise NotImplementedError

    def get(self, dream_id: str) -> Optional[Dream]:
        raise NotImplementedError

    def list_by_user(self, user_phone: str, limit: int = 20) -> List[Dream]:
        raise NotImplementedError

    def find_resonance(
        self,
        embedding: List[float],
        exclude_user: str,
        k: int = 3,
        within: Optional[timedelta] = None,
    ) -> List[ResonanceMatch]:
        raise NotImplementedError
