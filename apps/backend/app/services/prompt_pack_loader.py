"""Prompt pack loader."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path


PROMPT_PACK_ROOT = Path(__file__).resolve().parent.parent / "prompt_packs" / "default"


@lru_cache(maxsize=1)
def load_default_prompt_pack() -> dict[str, str]:
    payload: dict[str, str] = {}
    for path in PROMPT_PACK_ROOT.glob("*.md"):
        payload[path.stem] = path.read_text(encoding="utf-8").strip()
    return payload
