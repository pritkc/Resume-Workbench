"""Load shipped prompt bodies from ``app/prompts/text/`` (UTF-8, normalized newlines)."""

from __future__ import annotations

from pathlib import Path

_TEXT_ROOT = Path(__file__).resolve().parent / "text"


def read_shipped_txt(relative_path: str) -> str:
    """Read ``relative_path`` under ``text/`` (e.g. ``parse_resume/system.txt``)."""
    rel = relative_path.lstrip("/")
    path = _TEXT_ROOT / rel
    if not path.is_file():
        msg = f"Missing shipped prompt file: text/{rel}"
        raise FileNotFoundError(msg)
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    text = raw.decode("utf-8")
    return text.replace("\r\n", "\n").replace("\r", "\n")


def text_root() -> Path:
    return _TEXT_ROOT
