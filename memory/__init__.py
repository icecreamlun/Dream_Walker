"""Memory backend factory. Switch via MEMORY_BACKEND=local|hydra."""
import os

from memory.store import MemoryStore
from memory.local_store import LocalMemoryStore


def get_store() -> MemoryStore:
    backend = os.getenv("MEMORY_BACKEND", "local").lower()
    if backend == "local":
        return LocalMemoryStore()
    if backend == "hydra":
        from memory.hydra_store import HydraDBMemoryStore
        return HydraDBMemoryStore()
    raise ValueError(f"Unknown MEMORY_BACKEND: {backend}")
