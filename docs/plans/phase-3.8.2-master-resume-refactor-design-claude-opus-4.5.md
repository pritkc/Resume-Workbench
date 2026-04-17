# Phase 3.8.2 — Multi-Resume Support: From Single Master to Flexible Base Selection

**Author:** Claude Opus 4.5
**Status:** IMPLEMENTED
**Created:** 2026-04-17

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Mental Model & Definitions](#2-mental-model--definitions)
3. [Current State Analysis](#3-current-state-analysis)
4. [Architecture Options](#4-architecture-options)
5. [Recommended Approach](#5-recommended-approach)
6. [Data Model](#6-data-model)
7. [Backend & API Changes](#7-backend--api-changes)
8. [Frontend Changes](#8-frontend-changes)
9. [UX Flow](#9-ux-flow)
10. [Robustness & Edge Cases](#10-robustness--edge-cases)
11. [Migration Strategy](#11-migration-strategy)
12. [Implementation Checklist](#12-implementation-checklist)
13. [Open Questions](#13-open-questions)

---

## 1. Executive Summary

### Problem

The current system enforces a **single master resume** as the gravitational center of all features. In practice, users maintain multiple stable base resumes for different roles (Frontend, Backend, ML Engineer) and need to:

- Pick which base to work from for a given job
- Fork/evolve resume lines without mixing unrelated content
- Keep the UX coherent as resume count grows

### Solution

Replace the single-master model with:

- **Flat list** of all resumes (no tree hierarchy in UI)
- **One "active" resume** at any time (the default for new workflows)
- **Multiple "pinned" resumes** (shown at top for quick access)
- **Any resume can be a parent** for tailoring (including tailored resumes)
- **Lineage tracked but hidden** (parent_id stored, shown only on demand)

### Key Constraints

| Constraint | Approach |
|------------|----------|
| Reliability over novelty | Reuse existing `parent_id` lineage; minimal new concepts |
| Minimize re-engineering | Evolve `is_master` → `is_active`; add `is_pinned` |
| Migration | Existing data can be discarded or manually adjusted |

---

## 2. Mental Model & Definitions

### Diagram: Resume Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                        RESUME LIST (flat)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Frontend Resume │  │ Backend Resume  │  │ ML Resume       │ │
│  │ ⭐ ACTIVE       │  │ 📌 PINNED       │  │ 📌 PINNED       │ │
│  │ parent: null    │  │ parent: null    │  │ parent: null    │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘ │
│           │                    │                                │
│           │ (tailored from)    │ (tailored from)                │
│           ▼                    ▼                                │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ Frontend@Google │  │ Backend@Meta    │                      │
│  │ parent: Frontend│  │ parent: Backend │                      │
│  └────────┬────────┘  └─────────────────┘                      │
│           │                                                     │
│           │ (tailored from — deep lineage allowed)              │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ Frontend@Google │                                           │
│  │ (Revised)       │                                           │
│  │ parent: F@Google│                                           │
│  └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Definitions

| Term | Definition |
|------|------------|
| **Resume** | Any resume record in the system — no distinction between "base" and "tailored" in the data model |
| **Active Resume** | The ONE resume currently marked as the default starting point for new tailoring workflows. Exactly one must exist at all times. |
| **Pinned Resume** | A resume marked for quick access. Multiple allowed. Shown at top of list. |
| **Parent Resume** | The resume from which another was tailored. Tracked via `parent_id`. Any resume (including tailored ones) can be a parent. |
| **Lineage** | The chain of parent relationships. Stored in database, shown only on demand. |
| **Base Resume** | Informal term for a resume with `parent_id = null` (uploaded, not tailored). No special database treatment. |

### Rules

1. **Exactly one active resume** must exist at all times
2. **Zero or more pinned resumes** — independent of active status
3. **A resume can be both active AND pinned** (active takes visual precedence)
4. **Any resume can be selected as parent** when starting a tailoring workflow
5. **Deleting the active resume** requires selecting a new active first (or auto-select next)

---

## 3. Current State Analysis

### What Exists Today

| Component | Current Behavior | Change Needed |
|-----------|------------------|---------------|
| `is_master` field | Boolean, exactly one TRUE | Rename to `is_active`, same semantics |
| `parent_id` field | Tracks lineage | Keep as-is |
| `set_master_resume()` | Clears others, sets one | Rename to `set_active_resume()` |
| Health check | "ready" requires master | "ready" requires active |
| Upload flow | Auto-sets as master if none | Auto-sets as active if none |
| Tailoring | Uses specified resume | Add explicit "source resume" selection |
| Resume list API | `include_master` filter | Replace with `pinned_first` sort option |

### Files Requiring Changes

**Backend (Critical):**
- `apps/backend/app/db/models.py` — Add `is_pinned`, rename `is_master`
- `apps/backend/app/db/repositories/resumes.py` — Update repository methods
- `apps/backend/app/database.py` — Update atomic operations
- `apps/backend/app/routers/resumes.py` — New endpoints for active/pinned
- `apps/backend/app/routers/health.py` — Update status logic

**Frontend (Critical):**
- `apps/frontend/app/(default)/dashboard/page.tsx` — Resume list with pinned/active
- `apps/frontend/app/(default)/tailor/page.tsx` — Source resume selector
- `apps/frontend/lib/api/resume.ts` — New API functions

---

## 4. Architecture Options

### Option A: Minimal Evolution (Recommended)

**Approach:** Rename `is_master` → `is_active`, add `is_pinned` boolean.

```python
# Resume model changes
is_active: bool = False   # Exactly one TRUE (renamed from is_master)
is_pinned: bool = False   # Multiple TRUE allowed
parent_id: str | None     # Unchanged — tracks lineage
```

**Pros:**
- Smallest change footprint
- Reuses existing enforcement logic
- Easy to understand
- Backward compatible with minor migration

**Cons:**
- Two separate booleans to manage
- Pinned order not guaranteed (unless we add `pinned_order`)

**Verdict:** Best fit for constraints. Simple, reliable, minimal.

---

### Option B: Resume Groups with Primary

**Approach:** Add `group_id` to cluster related resumes, with one primary per group.

```python
group_id: str | None      # Clusters resumes (e.g., "frontend-roles")
is_group_primary: bool    # One TRUE per group
is_pinned: bool
```

**Pros:**
- Explicit grouping for organization
- Could support "switch context" by group

**Cons:**
- More complex data model
- Requires group management UI
- Overkill for the stated requirements
- User explicitly rejected hierarchy

**Verdict:** Over-engineered. User wants flat list.

---

### Option C: Tags Instead of Flags

**Approach:** Replace booleans with a tags array.

```python
tags: list[str] = []  # ["active", "pinned", "frontend", "2024"]
```

**Pros:**
- Flexible — can add any categorization
- Single field instead of multiple booleans

**Cons:**
- Harder to enforce "exactly one active"
- Query complexity increases
- More ways for data to become inconsistent

**Verdict:** Flexibility we don't need, with reliability risks.

---

### Comparison Matrix

| Criterion | Option A (Minimal) | Option B (Groups) | Option C (Tags) |
|-----------|-------------------|-------------------|-----------------|
| Implementation effort | Low | Medium | Medium |
| Data model complexity | Low | Medium | Medium |
| Enforcement reliability | High | Medium | Low |
| Fits user's mental model | Yes | No (too structured) | Partial |
| Future flexibility | Moderate | High | High |
| Risk of ambiguous states | Low | Medium | High |

**Recommendation: Option A**

---

## 5. Recommended Approach

### Core Design

1. **Rename `is_master` → `is_active`** — Same semantics, clearer name
2. **Add `is_pinned` boolean** — Multiple allowed, independent of active
3. **Add `pinned_at` timestamp** — For stable sort order of pinned resumes
4. **Keep `parent_id` unchanged** — Lineage tracking already works
5. **Update list endpoint** — Return pinned first, then by date

### Selection Behavior

| Action | Result |
|--------|--------|
| Set resume as active | Previous active becomes non-active; new one becomes active |
| Pin a resume | `is_pinned = True`, `pinned_at = now()` |
| Unpin a resume | `is_pinned = False`, `pinned_at = null` |
| Delete active resume | Block deletion OR auto-select next resume as active |
| Upload first resume | Automatically becomes active |

### Tailoring Workflow Change

**Current:** Tailoring implicitly uses "master resume" or specified resume.

**New:** Tailoring explicitly requires source resume selection:
1. User clicks "Tailor"
2. If coming from a specific resume → that's the source
3. If starting fresh → show selector, default to active resume
4. Selected source stored in `ApplicationPack.base_resume_id`

---

## 6. Data Model

### Schema Changes

```python
# apps/backend/app/db/models.py

class Resume(Base):
    __tablename__ = "resumes"

    resume_id: Mapped[str] = mapped_column(String, primary_key=True)

    # CHANGED: Renamed from is_master
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    # NEW: Pinned for quick access
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # UNCHANGED: Lineage tracking
    parent_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)

    # ... rest unchanged
```

### Database Constraints

```sql
-- Ensure exactly one active resume (enforced in application layer)
-- No database constraint — handled by repository methods with locking

-- Index for efficient queries
CREATE INDEX ix_resumes_is_active ON resumes (is_active) WHERE is_active = TRUE;
CREATE INDEX ix_resumes_is_pinned ON resumes (is_pinned) WHERE is_pinned = TRUE;
```

### Pydantic Schema Updates

```python
# apps/backend/app/schemas/models.py

class ResumeSummary(BaseModel):
    resume_id: str
    title: str | None
    is_active: bool          # Renamed from is_master
    is_pinned: bool          # New
    pinned_at: datetime | None  # New
    parent_id: str | None
    # ... rest unchanged

class ResumeListResponse(BaseModel):
    resumes: list[ResumeSummary]
    active_resume_id: str | None  # Convenience field
```

---

## 7. Backend & API Changes

### New/Modified Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `PUT /resumes/{id}/active` | PUT | Set resume as active |
| `PUT /resumes/{id}/pin` | PUT | Pin/unpin resume |
| `GET /resumes/list` | GET | Returns list with pinned first |
| `GET /resumes/active` | GET | Returns current active resume |
| `DELETE /resumes/{id}` | DELETE | Block if active; require replacement |

### Endpoint Specifications

#### `PUT /resumes/{id}/active`

```python
@router.put("/resumes/{resume_id}/active")
async def set_active_resume(resume_id: str) -> ResumeSummary:
    """Set a resume as the active (default) resume.

    - Clears active flag from previous active resume
    - Sets active flag on specified resume
    - Returns updated resume summary
    """
    # Uses existing atomic pattern from set_master_resume
```

#### `PUT /resumes/{id}/pin`

```python
class PinRequest(BaseModel):
    pinned: bool

@router.put("/resumes/{resume_id}/pin")
async def set_resume_pinned(resume_id: str, request: PinRequest) -> ResumeSummary:
    """Pin or unpin a resume.

    - Sets is_pinned flag
    - Sets pinned_at timestamp (for sort order)
    - Returns updated resume summary
    """
```

#### `GET /resumes/list` (Modified)

```python
@router.get("/resumes/list")
async def list_resumes(
    include_active: bool = Query(True),  # Renamed from include_master
) -> ResumeListResponse:
    """List all resumes, pinned first, then by date.

    Sort order:
    1. Active resume (if pinned, stays in pinned section)
    2. Pinned resumes (by pinned_at DESC)
    3. Other resumes (by created_at DESC)
    """
```

### Repository Changes

```python
# apps/backend/app/db/repositories/resumes.py

def get_active_resume(session: Session) -> Resume | None:
    """Get the currently active resume."""
    return session.scalar(
        select(Resume).where(Resume.is_active.is_(True)).limit(1)
    )

def set_active_resume(session: Session, resume_id: str) -> Resume:
    """Set a resume as active, clearing previous active."""
    # Clear existing active
    session.execute(
        update(Resume).where(Resume.is_active.is_(True)).values(is_active=False)
    )
    # Set new active
    resume = session.get(Resume, resume_id)
    if not resume:
        raise ValueError(f"Resume not found: {resume_id}")
    resume.is_active = True
    session.commit()
    return resume

def set_resume_pinned(session: Session, resume_id: str, pinned: bool) -> Resume:
    """Pin or unpin a resume."""
    resume = session.get(Resume, resume_id)
    if not resume:
        raise ValueError(f"Resume not found: {resume_id}")
    resume.is_pinned = pinned
    resume.pinned_at = datetime.utcnow() if pinned else None
    session.commit()
    return resume

def list_resumes_sorted(session: Session) -> list[Resume]:
    """List resumes: pinned first (by pinned_at), then by created_at."""
    return list(session.scalars(
        select(Resume).order_by(
            Resume.is_pinned.desc(),
            Resume.pinned_at.desc().nullslast(),
            Resume.created_at.desc()
        )
    ))
```

### Health Check Update

```python
# apps/backend/app/routers/health.py

@router.get("/status")
async def get_status() -> StatusResponse:
    db_stats = db.get_stats()
    # CHANGED: Check for active resume instead of master
    status = "setup_required" if not db_stats.get("has_active_resume") else "ready"
    return StatusResponse(
        has_active_resume=db_stats.get("has_active_resume", False),  # Renamed
        # ... rest unchanged
    )
```

---

## 8. Frontend Changes

### Components to Modify

| Component | Changes |
|-----------|---------|
| `dashboard/page.tsx` | Show pinned section, active badge, pin/unpin actions |
| `tailor/page.tsx` | Add source resume selector |
| `lib/api/resume.ts` | New API functions for active/pin |
| `lib/context/status-cache.tsx` | Rename `has_master_resume` → `has_active_resume` |

### Resume List UI

```
┌─────────────────────────────────────────────────────────────────┐
│  MY RESUMES                                              [+ New] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📌 PINNED                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ⭐ Frontend Engineer Resume          [Set Active] [Unpin]  ││
│  │    Active • Last updated 2 days ago                         ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 📌 Backend Engineer Resume           [Set Active] [Unpin]  ││
│  │    Pinned • Last updated 1 week ago                         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ALL RESUMES                                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │    ML Engineer Resume                [Set Active] [Pin]     ││
│  │    Last updated 3 weeks ago                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │    Frontend@Google                   [Set Active] [Pin]     ││
│  │    Tailored • Last updated 1 month ago                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Source Resume Selector (Tailor Page)

```
┌─────────────────────────────────────────────────────────────────┐
│  TAILOR RESUME                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Source Resume:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ⭐ Frontend Engineer Resume (Active)              [Change] ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Job Description:                                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [Paste or upload job description...]                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│                                            [Generate Tailored] │
└─────────────────────────────────────────────────────────────────┘
```

### API Client Updates

```typescript
// apps/frontend/lib/api/resume.ts

export async function setActiveResume(resumeId: string): Promise<ResumeSummary> {
  return apiFetch(`/resumes/${resumeId}/active`, { method: 'PUT' });
}

export async function pinResume(resumeId: string, pinned: boolean): Promise<ResumeSummary> {
  return apiFetch(`/resumes/${resumeId}/pin`, {
    method: 'PUT',
    body: JSON.stringify({ pinned }),
  });
}

export async function getActiveResume(): Promise<ResumeSummary | null> {
  return apiFetch('/resumes/active');
}
```

---

## 9. UX Flow

### Flow 1: First Resume Upload

```
User uploads first resume
         │
         ▼
┌─────────────────────┐
│ Resume parsed and   │
│ stored              │
│ is_active = TRUE    │ ← Automatic
│ is_pinned = FALSE   │
└─────────────────────┘
         │
         ▼
Dashboard shows resume as "Active"
```

### Flow 2: Setting Active Resume

```
User clicks [Set Active] on any resume
         │
         ▼
┌─────────────────────┐
│ PUT /resumes/{id}/  │
│     active          │
└─────────────────────┘
         │
         ▼
Previous active → is_active = FALSE
Selected → is_active = TRUE
         │
         ▼
UI updates badges
```

### Flow 3: Tailoring from Specific Resume

```
User on dashboard clicks [Tailor] on "Backend Resume"
         │
         ▼
┌─────────────────────┐
│ Navigate to /tailor │
│ source = Backend    │
│ Resume              │
└─────────────────────┘
         │
         ▼
Tailor page pre-selects "Backend Resume" as source
         │
         ▼
User completes tailoring → new resume created
New resume: parent_id = Backend Resume ID
```

### Flow 4: Starting Fresh Tailoring

```
User navigates directly to /tailor (no context)
         │
         ▼
┌─────────────────────┐
│ Source defaults to  │
│ Active Resume       │
│ [Change] available  │
└─────────────────────┘
         │
         ▼
User can change source or proceed with active
```

---

## 10. Robustness & Edge Cases

### Invariants to Enforce

| Invariant | Enforcement |
|-----------|-------------|
| Exactly one active resume | Repository method clears others before setting |
| Active resume exists if any resumes exist | Upload auto-sets; delete blocks or auto-selects |
| Pinned timestamps monotonic | Set to `now()` on pin, clear on unpin |

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Delete active resume | Option A: Block with error "Select new active first"<br>Option B: Auto-select most recent as active |
| Delete only resume | Allow; status returns to "setup_required" |
| Unpin active resume | Allowed; active and pinned are independent |
| Two requests to set active simultaneously | Database transaction + lock ensures one wins |
| Resume with parent_id deleted | Orphaned children keep their parent_id (tombstone reference); no cascade |

### Recommended: Block Active Deletion

```python
@router.delete("/resumes/{resume_id}")
async def delete_resume(resume_id: str):
    resume = db.get_resume(resume_id)
    if resume.is_active:
        # Count other resumes
        others = db.count_resumes() - 1
        if others > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete active resume. Set another resume as active first."
            )
    # Proceed with deletion
```

---

## 11. Migration Strategy

### Approach: Clean Slate with Auto-Migration

Since existing data is test data, we take the simple path:

1. **Rename column:** `is_master` → `is_active` (Alembic migration)
2. **Add columns:** `is_pinned`, `pinned_at`
3. **Preserve existing state:** Current `is_master=True` becomes `is_active=True`

### Migration Script

```python
# alembic/versions/xxxx_multi_resume_support.py

def upgrade():
    # Rename is_master to is_active
    op.alter_column('resumes', 'is_master', new_column_name='is_active')

    # Add pinning columns
    op.add_column('resumes', sa.Column('is_pinned', sa.Boolean(), default=False))
    op.add_column('resumes', sa.Column('pinned_at', sa.DateTime(), nullable=True))

    # Add indexes
    op.create_index('ix_resumes_is_active', 'resumes', ['is_active'])
    op.create_index('ix_resumes_is_pinned', 'resumes', ['is_pinned'])

def downgrade():
    op.drop_index('ix_resumes_is_pinned')
    op.drop_index('ix_resumes_is_active')
    op.drop_column('resumes', 'pinned_at')
    op.drop_column('resumes', 'is_pinned')
    op.alter_column('resumes', 'is_active', new_column_name='is_master')
```

---

## 12. Implementation Checklist

### Phase 1: Data Model (Backend Foundation)

```
[x] 1.1  Add Alembic migration: rename is_master → is_active
[x] 1.2  Add Alembic migration: add is_pinned, pinned_at columns
[x] 1.3  Update Resume SQLAlchemy model
[x] 1.4  Update ResumeSummary Pydantic schema
[x] 1.5  Run migrations on dev database
[x] 1.6  Write unit tests for new fields
```

### Phase 2: Repository Layer (Backend)

```
[x] 2.1  Rename get_master_resume() → get_active_resume()
[x] 2.2  Rename set_master_resume() → set_active_resume()
[x] 2.3  Add set_resume_pinned() method
[x] 2.4  Update list_resumes() to sort pinned first
[x] 2.5  Update create_resume_atomic_master → create_resume_atomic_active
[x] 2.6  Write repository unit tests
```

### Phase 3: API Endpoints (Backend)

```
[x] 3.1  Add PUT /resumes/{id}/active endpoint
[x] 3.2  Add PUT /resumes/{id}/pin endpoint
[x] 3.3  Update GET /resumes/list (rename include_master → include_active)
[x] 3.4  Add GET /resumes/active endpoint
[x] 3.5  Update DELETE /resumes/{id} to block active deletion
[x] 3.6  Update GET /status (rename has_master_resume → has_active_resume)
[x] 3.7  Write API integration tests
```

### Phase 4: Frontend API Client

```
[x] 4.1  Add setActiveResume() function
[x] 4.2  Add pinResume() function
[x] 4.3  Add getActiveResume() function
[x] 4.4  Update fetchResumeList() parameters
[x] 4.5  Update StatusResponse type
[x] 4.6  Update ResumeSummary type
```

### Phase 5: Frontend UI — Dashboard

```
[x] 5.1  Update dashboard to show pinned section
[x] 5.2  Add "Active" badge component
[x] 5.3  Add "Pinned" badge component
[x] 5.4  Add [Set Active] button with handler
[x] 5.5  Add [Pin]/[Unpin] button with handler
[x] 5.6  Update resume list sorting (pinned first)
[x] 5.7  Remove hardcoded masterResumeId logic
```

### Phase 6: Frontend UI — Tailor Page

```
[x] 6.1  Add source resume selector component
[x] 6.2  Default to active resume when no context
[x] 6.3  Pre-select resume when navigating from dashboard [Tailor] button
[x] 6.4  Pass source resume to tailoring API
[x] 6.5  Update ApplicationPack creation with base_resume_id
```

### Phase 7: Cleanup & Polish

```
[x] 7.1  Search codebase for "master" references, update to "active"
[x] 7.2  Update i18n strings (if any reference "master")
[x] 7.3  Update status-cache context
[x] 7.4  End-to-end testing: upload → pin → set active → tailor
[x] 7.5  npm run lint passes
[x] 7.6  All tests pass
```

---

## 13. Open Questions

### Resolved

| Question | Resolution |
|----------|------------|
| Tree vs flat UI? | Flat list — user preference |
| Show lineage? | Track but hide — show only on demand |
| Multiple active? | No — exactly one active at all times |

### Deferred / Future

| Question | Notes |
|----------|-------|
| Lineage visualization | Could add "View History" modal later if needed |
| Bulk actions | Pin/unpin multiple at once — not needed now |
| Search/filter | By title, date, etc. — consider when list grows large |
| Archive vs delete | Soft delete for resumes — out of scope for this phase |

---

## Quick Reference

### Data Model

```python
Resume:
  is_active: bool     # Exactly one TRUE
  is_pinned: bool     # Multiple TRUE allowed
  pinned_at: datetime # For sort order
  parent_id: str      # Lineage (unchanged)
```

### API Endpoints

```
PUT  /resumes/{id}/active  → Set as active
PUT  /resumes/{id}/pin     → Pin/unpin
GET  /resumes/active       → Get current active
GET  /resumes/list         → Pinned first, then by date
```

### Sort Order

```
1. Pinned resumes (by pinned_at DESC)
2. Non-pinned resumes (by created_at DESC)
Note: Active resume appears wherever it falls based on pinned/date
```

---

*End of Phase 3.8.2 Design Document*
