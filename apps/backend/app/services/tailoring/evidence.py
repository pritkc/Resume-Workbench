"""Deterministic evidence binder — pre-computes JD term support from master resume before LLM call."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from app.services.tailoring.analysis import keyword_in_text, extract_resume_text


@dataclass
class SupportedTerm:
    term: str
    source_locations: list[str]  # e.g. ["experience.0", "skills"]


@dataclass
class AdjacentTerm:
    term: str
    adjacent_resume_terms: list[str]


@dataclass
class RoleDepth:
    index: int
    company: str
    position: str
    tenure_signal: str  # e.g. "3 months", "1 year", "present"
    is_internship: bool
    is_current: bool
    bullet_count: int
    tech_stacks: str | None


@dataclass
class NewGradProfile:
    graduation_signals: list[str]  # degree + institution + year
    strongest_role_index: int | None
    max_credible_scope: str  # e.g. "team-level delivery, owned a feature end-to-end"


@dataclass
class EvidenceBinder:
    supported_terms: list[SupportedTerm] = field(default_factory=list)
    adjacent_terms: list[AdjacentTerm] = field(default_factory=list)
    unsupported_terms: list[str] = field(default_factory=list)
    role_depth: list[RoleDepth] = field(default_factory=list)
    new_grad_profile: NewGradProfile | None = None

    def to_prompt_dict(self) -> dict[str, Any]:
        """Compact JSON-friendly dict for LLM prompt injection."""
        out: dict[str, Any] = {}
        if self.supported_terms:
            out["supported"] = [{"term": t.term, "at": t.source_locations} for t in self.supported_terms]
        if self.adjacent_terms:
            out["adjacent"] = [{"term": t.term, "see_also": t.adjacent_resume_terms} for t in self.adjacent_terms]
        if self.unsupported_terms:
            out["unsupported"] = self.unsupported_terms
        if self.role_depth:
            out["roles"] = [
                {k: v for k, v in {
                    "i": r.index,
                    "company": r.company,
                    "pos": r.position,
                    "tenure": r.tenure_signal,
                    "intern": r.is_internship or None,
                    "current": r.is_current or None,
                    "bullets": r.bullet_count,
                    "tech": r.tech_stacks,
                }.items() if v is not None}
                for r in self.role_depth
            ]
        if self.new_grad_profile:
            out["new_grad"] = {
                "education": self.new_grad_profile.graduation_signals,
                "max_scope": self.new_grad_profile.max_credible_scope,
            }
        return out


# ── Internship detection ────────────────────────────────────────────────────

_INTERN_PATTERN = re.compile(r"\bintern(ship)?\b", re.IGNORECASE)


def _is_internship(position: str, company: str) -> bool:
    return bool(_INTERN_PATTERN.search(position) or _INTERN_PATTERN.search(company))


# ── Current role detection ──────────────────────────────────────────────────

_PRESENT_PATTERN = re.compile(r"\b(present|current|now)\b", re.IGNORECASE)


def _is_current_role(end_date: str | None) -> bool:
    if end_date is None:
        return True
    return bool(_PRESENT_PATTERN.search(str(end_date)))


# ── Tenure signal ───────────────────────────────────────────────────────────

_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")


def _parse_year(text: str | None) -> int | None:
    if not text:
        return None
    m = _YEAR_RE.search(str(text))
    return int(m.group()) if m else None


def _tenure_signal(start_date: str | None, end_date: str | None, date_str: str | None, years_str: str | None) -> str:
    """Produce a human-readable tenure hint from available date fields."""
    # Try to derive from start/end year
    sy = _parse_year(start_date)
    if end_date and not _PRESENT_PATTERN.search(str(end_date)):
        ey = _parse_year(end_date)
    else:
        ey = None

    current = _is_current_role(end_date)

    if sy is not None:
        end_year = ey if ey is not None else datetime.now().year
        diff = end_year - sy
        if current:
            suffix = " - present"
        else:
            suffix = ""
        if diff == 0:
            return f"< 1 year{suffix}"
        elif diff == 1:
            return f"~1 year{suffix}"
        else:
            return f"~{diff} years{suffix}"

    # Fall back to raw string
    for raw in (date_str, years_str):
        if raw and raw.strip():
            return raw.strip()
    return "unknown"


# ── Section text extraction ─────────────────────────────────────────────────

def _extract_section_text(value: Any) -> str:
    """Flatten a single section's content into text."""
    return extract_resume_text(value)


def _build_section_texts(resume_data: dict[str, Any]) -> dict[str, str]:
    """Map section keys to their extracted text for location reporting."""
    texts: dict[str, str] = {}

    if summary := resume_data.get("summary"):
        texts["summary"] = extract_resume_text(summary)

    for i, entry in enumerate(resume_data.get("workExperience") or []):
        texts[f"experience.{i}"] = extract_resume_text(entry)

    for i, entry in enumerate(resume_data.get("personalProjects") or []):
        texts[f"projects.{i}"] = extract_resume_text(entry)

    skills = resume_data.get("skills") or resume_data.get("additional")
    if skills:
        texts["skills"] = extract_resume_text(skills)

    for key, section in (resume_data.get("customSections") or {}).items():
        texts[f"custom.{key}"] = extract_resume_text(section)

    return texts


# ── Adjacent term helpers ────────────────────────────────────────────────────

_WORD_RE = re.compile(r"[a-z][a-z0-9+#.]*", re.IGNORECASE)
_MIN_WORD_LEN = 3


def _words_from_term(term: str) -> list[str]:
    return [w for w in _WORD_RE.findall(term) if len(w) >= _MIN_WORD_LEN]


def _nearby_resume_words(term: str, text: str, *, window: int = 60) -> list[str]:
    """Return unique words that appear near a partial-match location."""
    for word in _words_from_term(term):
        pattern = rf"\b{re.escape(word.casefold())}\b"
        for m in re.finditer(pattern, text.casefold()):
            start = max(0, m.start() - window)
            end = min(len(text), m.end() + window)
            snippet = text[start:end]
            words = _WORD_RE.findall(snippet)
            found = [
                w for w in words
                if len(w) >= _MIN_WORD_LEN and w.casefold() != word.casefold()
            ]
            seen: dict[str, str] = {}
            for w in found:
                seen[w.casefold()] = w
            return list(seen.values())[:8]
    return []


# ── JD term collection ───────────────────────────────────────────────────────

def _collect_jd_terms(jd_intelligence: Any) -> list[str]:
    """Gather all terms worth checking: ats_keywords + priority_keywords + theme first words."""
    terms: list[str] = []
    seen: set[str] = set()

    def _add(t: str) -> None:
        normalized = t.strip()
        if normalized and normalized.casefold() not in seen:
            seen.add(normalized.casefold())
            terms.append(normalized)

    for kw in getattr(jd_intelligence, "ats_keywords", None) or []:
        _add(str(kw))
    for kw in getattr(jd_intelligence, "priority_keywords", None) or []:
        _add(str(kw))

    for theme in getattr(jd_intelligence, "responsibility_themes", None) or []:
        # First 5 words of each theme
        words = str(theme).split()[:5]
        _add(" ".join(words))

    return terms


# ── Education helpers ────────────────────────────────────────────────────────

_RECENT_GRAD_YEAR = 2021  # graduation after this year → new-grad signal


def _education_graduation_signals(resume_data: dict[str, Any]) -> list[str]:
    signals: list[str] = []
    for entry in (resume_data.get("education") or []):
        if not isinstance(entry, dict):
            continue
        degree = entry.get("degree", "")
        area = entry.get("area", "")
        institution = entry.get("institution", "")
        date_val = (
            entry.get("date")
            or entry.get("years")
            or entry.get("end_date")
            or entry.get("endDate")
            or ""
        )
        parts = [p for p in [degree, area, institution, date_val] if p]
        if parts:
            signals.append(", ".join(parts))
    return signals


def _is_recent_grad(resume_data: dict[str, Any], jd_intelligence: Any) -> bool:
    """Detect new-grad profile from seniority signal OR recent graduation year."""
    seniority = ""
    role = getattr(jd_intelligence, "role", None)
    if role:
        seniority = getattr(role, "seniority", None) or ""
    if seniority in ("new-grad", "entry-level", "junior"):
        return True

    for entry in (resume_data.get("education") or []):
        if not isinstance(entry, dict):
            continue
        date_val = str(
            entry.get("date")
            or entry.get("years")
            or entry.get("end_date")
            or entry.get("endDate")
            or ""
        )
        grad_year = _parse_year(date_val)
        if grad_year and grad_year > _RECENT_GRAD_YEAR:
            return True
    return False


# ── Role depth builder ───────────────────────────────────────────────────────

def _build_role_depth(resume_payload: Any) -> list[RoleDepth]:
    """Build RoleDepth list from TailoringResumePayload."""
    roles: list[RoleDepth] = []
    for i, entry in enumerate(getattr(resume_payload, "workExperience", None) or []):
        position = getattr(entry, "position", "") or getattr(entry, "title", "") or ""
        company = getattr(entry, "company", "") or ""
        start_date = getattr(entry, "start_date", None)
        end_date = getattr(entry, "end_date", None)
        date_str = getattr(entry, "date", None)
        years_str = getattr(entry, "years", None)
        tech_stacks = getattr(entry, "tech_stacks", None)
        description = getattr(entry, "description", None) or []
        bullet_count = len(description) if isinstance(description, list) else 0

        roles.append(RoleDepth(
            index=i,
            company=company,
            position=position,
            tenure_signal=_tenure_signal(start_date, end_date, date_str, years_str),
            is_internship=_is_internship(position, company),
            is_current=_is_current_role(end_date),
            bullet_count=bullet_count,
            tech_stacks=tech_stacks or None,
        ))
    return roles


# ── Main builder ─────────────────────────────────────────────────────────────

def build_evidence_binder(
    jd_intelligence: Any,  # JDIntelligence
    resume_payload: Any,  # TailoringResumePayload | None
    original_resume_data: dict[str, Any] | None = None,
) -> EvidenceBinder:
    """Pre-compute JD term support from the master resume before the LLM call."""

    resume_data = original_resume_data or {}

    # Build section text map for location detection
    section_texts = _build_section_texts(resume_data)
    full_resume_text = "\n".join(section_texts.values())

    # Collect all JD terms to check
    jd_terms = _collect_jd_terms(jd_intelligence)

    supported: list[SupportedTerm] = []
    adjacent: list[AdjacentTerm] = []
    unsupported: list[str] = []

    for term in jd_terms:
        # Check full resume for presence
        if keyword_in_text(term, full_resume_text):
            # Find which sections
            locations = [
                loc
                for loc, text in section_texts.items()
                if keyword_in_text(term, text)
            ]
            supported.append(SupportedTerm(term=term, source_locations=locations))
        else:
            # Check if any word from the term appears (adjacent)
            term_words = _words_from_term(term)
            adjacent_words: list[str] = []
            for word in term_words:
                if keyword_in_text(word, full_resume_text):
                    nearby = _nearby_resume_words(term, full_resume_text)
                    adjacent_words.extend(nearby)
                    break  # one word match is enough to classify as adjacent

            if adjacent_words:
                # Deduplicate
                seen_adj: dict[str, str] = {}
                for w in adjacent_words:
                    seen_adj[w.casefold()] = w
                adjacent.append(AdjacentTerm(
                    term=term,
                    adjacent_resume_terms=list(seen_adj.values())[:6],
                ))
            else:
                unsupported.append(term)

    # Build role depth from payload if available
    role_depth: list[RoleDepth] = []
    if resume_payload is not None:
        role_depth = _build_role_depth(resume_payload)

    # New grad profile
    new_grad_profile: NewGradProfile | None = None
    if _is_recent_grad(resume_data, jd_intelligence):
        grad_signals = _education_graduation_signals(resume_data)
        # Find strongest role: first non-internship or just first role
        strongest: int | None = None
        if role_depth:
            for rd in role_depth:
                if not rd.is_internship:
                    strongest = rd.index
                    break
            if strongest is None:
                strongest = role_depth[0].index

        new_grad_profile = NewGradProfile(
            graduation_signals=grad_signals,
            strongest_role_index=strongest,
            max_credible_scope="team-level delivery, owned a feature end-to-end",
        )

    return EvidenceBinder(
        supported_terms=supported,
        adjacent_terms=adjacent,
        unsupported_terms=unsupported,
        role_depth=role_depth,
        new_grad_profile=new_grad_profile,
    )
