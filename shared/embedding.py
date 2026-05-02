"""Single source of truth for the embedding vector space.

ALL embeddings (seed data + runtime queries) MUST go through this module
or the resonance similarity scores become meaningless.
"""
from typing import List, Optional

from openai import OpenAI

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


def embed(text: str) -> List[float]:
    return embed_batch([text])[0]


def embed_batch(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []
    response = _get_client().embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )
    return [item.embedding for item in response.data]
