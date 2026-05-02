# DreamWeaver — Design Document

> Source of truth for the 4-hour hackathon build.
> Authoritative product vision: PDF (DreamWeaver). PRODUCT_PLAN.md is historical.
> Generated from a structured brainstorming session — 8 decisions, all locked.

---

## 1. Context & Goals

**One-liner**: SMS-native dream agent. User texts a half-asleep dream → agent decodes via I Ching, generates a cinematic video, and surfaces strangers who dreamt the same thing last night.

**Demo**: 90-second pitch, the "wow" moments are (1) the user's dream as a film, (2) "2 strangers also dreamt of crossing water last night."

**Sponsor judges to win over**: Harnoor (HydraDB), Julie & Patrick (Photon). HydraDB and Photon must be **deeply** used, not API-shimmed.

**Hard constraints**:
- 14:00 P0 freeze (no new features after)
- 14:30 backup demo recording must exist
- 15:30 final stop, demo at 16:30

---

## 2. The 8 Decisions (Locked)

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Conversation state machine | **LLM autonomous decision** (chosen earlier) | Lets agent feel intelligent; needed for PDF demo's "ask one clarifying question" beat |
| 2 | Embedding source | **OpenAI text-embedding-3-small** (chosen earlier) | 5 lines of code, ultra-stable, single source of truth for vector space |
| 3 | HydraDB namespace strategy | **Single namespace + metadata filter** (chosen earlier) | Functionally equivalent to multi-namespace, simpler schema |
| 4 | Static dream page | **FastAPI + Jinja** (chosen earlier) | Saves 30 min vs Next.js init |
| 5 | HydraDB depth tier | **D — show off** (hybrid + reranking + multi-namespace, then reduced to hybrid + time-decay) | Harnoor must see deep usage; "vector + metadata hybrid" is in-the-weeds talk that lands |
| 6 | Vacuum period strategy | **D — core mock + advanced defer** | Build full interface now; LocalMemoryStore implements only insert/vector search/metadata filter; advanced methods raise NotImplementedError until SDK arrives |
| 7 | Show-off feature picks | **D — Hybrid search + Time-decay scoring** | Hybrid is the in-the-weeds move; time-decay is near-free and gives "last night" pitch handle |
| 8 | Embedding input format | **C — `summary + key_imagery` joined, summary forced English** | Single canonical input function; cross-language alignment via forced-English summary |
| 9 | Resonance query parameters | **D — Elastic two-tier** | 24h strict → fallback to 7d; over-fetch 20; no threshold; time-decay τ=48h; top_k=2 |
| 10 | Seed dream orchestration | **C — Compromise** | 2 pre-generated PixVerse videos (main + 1 soulmate); 2nd resonance card text-only |
| 11 | LLM state machine | **C — JSON output + hard cap 3 turns** | Pydantic-validated, retry once, fail-open to process; rule-driven prompt prevents drift |
| 12 | Pipeline orchestration | **B — Smart parallel** | LLM chain serial; PixVerse poll runs concurrent with embed+HydraDB insert via asyncio.gather |

(Decisions 1-4 were made informally before the brainstorming skill engaged. Decisions 5-12 came out of the structured session.)

---

## 3. Architecture

```
                ┌──────────────────────────────────────┐
       user SMS │  Photon (inbound + outbound)         │
       ────────►│  iMessage / SMS                      │
                └────────────────┬─────────────────────┘
                                 │ webhook POST
                                 ▼
        ┌───────────────────────────────────────────────────────┐
        │  FastAPI app (single process, BackgroundTasks)        │
        │                                                       │
        │  POST /sms-webhook   — sync: handle_sms() < 1s        │
        │  GET  /dream/{id}    — Jinja render                   │
        │                                                       │
        │  conversation.py     — JSON state machine, cap 3      │
        │  pipeline.py         — async dream-build pipeline     │
        └────┬─────────┬─────────┬──────────────────┬───────────┘
             │         │         │                  │
             ▼         ▼         ▼                  ▼
         ┌──────┐  ┌──────┐  ┌──────────────┐  ┌────────┐
         │ GMI  │  │PixVer│  │  HydraDB     │  │ Photon │
         │ LLM  │  │ se   │  │  (memory)    │  │outbound│
         │      │  │video │  │              │  │        │
         │ x3   │  │      │  │ insert/      │  │  send  │
         │ calls│  │ 30-60│  │ hybrid       │  │  link  │
         │      │  │ s    │  │ search       │  │        │
         └──────┘  └──────┘  └──────────────┘  └────────┘
                                  │
                                  ▼ fallback
                            ┌──────────────┐
                            │ LocalMemory  │
                            │ Store (numpy)│
                            └──────────────┘
```

---

## 4. Data Model

### 4.1 Dream (canonical schema, used by all stores)

```python
class Dream:
    dream_id: str                    # uuid4
    user_phone: str                  # +1xxx (real phone format, masked at display)
    created_at: datetime             # UTC
    raw_text: str                    # joined SMS messages
    structured: Structured           # title, summary (EN), characters, scenes, emotions, key_imagery (EN)
    divination: Divination | None    # gua_name, gua_meaning, interpretation, visual_brief
    video_url: str | None            # PixVerse URL or PLACEHOLDER
    embedding: list[float] | None    # 1536-d, from text-embedding-3-small
```

### 4.2 Embedding input (single canonical function)

```python
def build_embedding_input(summary: str, key_imagery: list[str]) -> str:
    return f"{summary} | {', '.join(key_imagery)}"
```

**Invariant**: ALL embeddings (seed + runtime) MUST go through this function.

### 4.3 ResonanceMatch (return type for `find_resonance`)

```python
class ResonanceMatch:
    dream_id: str
    user_phone_masked: str           # "+1***0001"
    title: str
    summary: str
    similarity: float                # cosine, before time-decay
    created_at: datetime
```

---

## 5. Components

### 5.1 `memory/` (Person B's domain, but Person A consumes it)

**Files**:
- `memory/store.py` — `MemoryStore` ABC: `insert / get / list_by_user / find_resonance`
- `memory/local_store.py` — in-memory dict + numpy cosine. P0 methods only.
- `memory/hydra_store.py` — TODO until workshop. Skeleton with NotImplementedError.
- `memory/__init__.py` — `get_store()` factory, switches on `MEMORY_BACKEND` env var.
- `memory/seed.py` — 10 pre-built dreams, runs once before demo.

**`find_resonance` algorithm** (D-elastic-two-tier from decision #9):

```python
def find_resonance(emb, exclude_user, k=2):
    # Tier 1: strict 24h
    candidates = store.query(emb, top_k=20, filter={
        "user_phone": {"$ne": exclude_user},
        "created_at": {"$gte": now - 24h},
    })
    # Tier 2 (fallback): no time filter
    if len(candidates) < k:
        candidates = store.query(emb, top_k=20, filter={"user_phone": {"$ne": exclude_user}})
    # Time-decay rerank: score = cosine * exp(-Δh / 48)
    for c in candidates:
        delta_h = (now() - c.created_at).total_seconds() / 3600
        c.final_score = c.similarity * exp(-delta_h / 48)
    candidates.sort(key=lambda c: c.final_score, reverse=True)
    return candidates[:k]
```

### 5.2 `backend/` (Person A's domain)

**Files**:
- `backend/main.py` — FastAPI app, `/sms-webhook`, `/dream/{id}`
- `backend/conversation.py` — JSON state machine (decision #11)
- `backend/pipeline.py` — async dream-build pipeline (decision #12)
- `backend/photon_client.py` — outbound SMS
- `backend/pixverse_client.py` — submit + poll (5s interval, 90s cap)
- `backend/gmi_client.py` — 3 LLM calls: extract / divine / cinematic_prompt
- `backend/prompts.py` — prompt templates

**Pipeline** (smart parallel, decision #12):

```
sync (webhook ≤ 1s):
  parse → handle_sms → photon.send_ack → return 200 → background_tasks.add_task

async (background, 35-65s):
  LLM extract_structured (10s)
  → LLM divine (10s)
  → LLM cinematic_prompt (5s)
  → pixverse.submit (instant, returns job_id)
  → asyncio.gather(
        get_embedding(text),                    # ~2s
        poll_pixverse_until_done(job_id, 90s),  # 30-60s
        return_exceptions=True,
     )
  → handle exceptions (zero-vec / placeholder URL)
  → store.insert(dream)  with HydraDB→Local fallback
  → photon.send_sms(phone, link)
```

### 5.3 `templates/` (Person B's domain)

- `templates/dream.html` — mobile-friendly static page rendering:
  - Gua hexagram (text or simple SVG)
  - Interpretation paragraph
  - PixVerse video (autoplay, muted)
  - Resonance section (2 cards from HydraDB)

### 5.4 `shared/` (cross-cutting)

- `shared/schemas.py` — Pydantic models (`Dream`, `Structured`, `Divination`, `VisualBrief`, `ResonanceMatch`)
- `shared/embedding.py` — `embed`, `embed_batch`, `build_embedding_input`, `EMBEDDING_MODEL` constant

---

## 6. State Machine (Decision #11 detail)

**Hard rules in system prompt**:
1. Turn 1 + msg < 100 chars → action=`ask`
2. Turn 1 + msg ≥ 100 chars → action=`process`
3. Turn ≥ 3 → action=`process` (forced)
4. Question MUST be < 15 words, dream-themed, probe ONE element

**Output format** (forced via `response_format={"type": "json_object"}`):

```json
{"action": "ask|process", "message": "...", "reasoning": "..."}
```

**Failure handling**:
- JSON parse fails → retry once
- Retry fails → force `action=process`, default message "Got it. Hold on—I'll dream-read this for you 🌊"

**Session storage**: in-memory dict `{phone: (messages, last_seen)}`. 5-minute timeout. No persistence.

---

## 7. Failure Handling Matrix

| Component | Failure mode | Recovery |
|---|---|---|
| LLM (state machine) | JSON parse fail / network | Retry 1×, then force-process with default message |
| LLM (extract / divine / cinematic) | Network / format | Hard fail this dream, send "sorry, try again" via Photon |
| PixVerse | Timeout > 90s, error | Use `PLACEHOLDER_VIDEO_URL`, demo continues with cached video |
| Embedding | API error | Fall back to zero vector (dream stored but unsearchable) |
| HydraDB | SDK error / network | Fall back to `LocalMemoryStore` (transparent — user sees nothing) |
| Photon outbound | Network | Log error, no recovery (user just doesn't get reply) |
| Webhook timeout | Photon retries | Webhook MUST return < 5s; long work is in BackgroundTasks |

---

## 8. Seed Dream Orchestration (Decision #10 + #9)

**Goal**: 10 dreams pre-loaded so resonance always returns ≥ 2 results.

**Composition**:
- 1 soulmate to demo dream (high vector match): "Standing at riverbank, hearing someone call from far side, unable to cross." → pre-generated PixVerse video
- 1 secondary match (shares "water" keyword): "Breathing underwater, watching a figure float above." → pre-generated PixVerse video
- 8 distractors (PDF §10 #2-#6, #8-#10, English-translated)

**Phone numbers**: `+15550000001` through `+15550000010`. Masked display: `+1***0001`.

**Timestamps** (random within ranges, computed at seed-time):
- 8 dreams: `now - random.uniform(2, 20) hours` (in 24h window)
- 2 dreams: `now - random.uniform(2, 5) days` (fallback pool)

**Demo dream pitch text** (locked, do not change):
> "I dreamt I was by a river. Someone in white was calling me from the other side, but I couldn't cross."

This text must produce a vector that's nearest-neighbor to the soulmate seed.

---

## 9. Implementation Sequence

```
T+0:00   open    Both: workshop, get API keys (GMI, HydraDB, Photon, PixVerse)
T+0:40           Both: align on this design doc, lock schema

T+1:00 - 1:30    A: Photon webhook hello-world (mock SMS)
                 B: HTML skeleton with query-string fake data

T+1:30 - 2:30    A: LLM state machine (conversation.py + JSON output)
                 B: Seed 10 dreams script (uses LocalMemoryStore first)

T+2:30 - 3:30    A: HydraDB integration (fill HydraDBMemoryStore)
                 B: Connect HTML to live JSON endpoint

T+3:30 - 4:00    A: PixVerse pipeline integration (submit + poll)
                 B: Pre-generate 2 PixVerse videos for seed dreams

T+4:00 - 4:45    A: Divination prompt tuning + agent active push
                 B: Video player + resonance card UI

T+4:45 - 5:00    Both: end-to-end smoke test

T+5:00 - 5:30    A: Bug fixes (PixVerse failure → placeholder)
                 B: RECORD BACKUP DEMO VIDEO (mandatory)

T+5:30 - 6:00    Demo rehearsal #1
T+6:00 - 6:30    Demo rehearsal #2 + pitch script polish
```

(Wall-clock anchors: T+0 = 9:00 workshop start; T+1 = 10:00 hacking start; T+5 = 14:00 P0 freeze.)

---

## 10. Open Items (Confirm at Workshop)

| Item | When | Who | Risk if wrong |
|---|---|---|---|
| HydraDB SDK actual signature | After Harnoor session | A | Adapt `hydra_store.py`; interface stable so business code untouched |
| HydraDB filter operator support (`$ne`, `$gte`) | After Harnoor session | A | If `$ne` unsupported, switch to over-fetch + Python post-filter (already in `find_resonance` design) |
| HydraDB metadata size limit | After Harnoor session | A | If <40KB, may need to sidecar `divination.interpretation` to local SQLite |
| Photon webhook payload schema | After Julie session | A | Fields may differ from `{from, to, body, message_id}` assumption |
| Photon outbound media support | After Julie session | A | Determines whether resonance link is plain SMS or MMS with thumbnail |
| GMI model name + endpoint | After Yuqi session | A | OpenAI-compatible client should JustWork™ |
| PixVerse rate limits / parallel jobs | Now | B | Affects whether 2 videos can be generated concurrently |

---

## 11. Risks & Backups (PDF §12 expanded)

| Risk | Pre-mitigation | Live fallback |
|---|---|---|
| PixVerse slow/fail | 2 pre-generated demo videos | Placeholder URL + pitch reframe |
| HydraDB SDK fails | LocalMemoryStore behind same interface | `MEMORY_BACKEND=local` env switch (zero code change) |
| Photon webhook public IP | ngrok + Cloudflare Tunnel as alt | Web input box as last resort |
| WiFi unstable | Phone hotspot | Backup demo recording (T+5:30) |
| Resonance returns 0 | Seed dreams in 24h window + fallback to 7d + no threshold | Time-decay sort always returns ≥ 2 |
| LLM hallucinates wrong gua | Prompt forces from 64-name list | Manual override list of 5 "safe" gua mappings for demo |
| Whole demo crashes | Backup video at T+5:30 | Play recording, narrate live |

---

## 12. Done Definition

P0 (must ship by 14:00):
- [ ] User SMS → agent reply (single round-trip, mock OK)
- [ ] LLM JSON state machine working (ask vs process)
- [ ] LLM extracts structured + divines gua + writes cinematic prompt
- [ ] PixVerse generates a real video (or returns placeholder)
- [ ] HydraDB stores dream with embedding
- [ ] HydraDB returns ≥ 2 resonance matches for demo dream
- [ ] Static `/dream/{id}` page renders gua + video + 2 resonance cards
- [ ] Photon outbound sends link via SMS
- [ ] 10 seed dreams loaded
- [ ] BackgroundTasks pipeline runs end-to-end without blocking webhook

P1 (nice-to-have, if time):
- [ ] Time-decay scoring polished
- [ ] Hybrid search (vector + keyword filter on `key_imagery`) wired through
- [ ] Resonance card video for soulmate match
- [ ] LLM "I'll help you decode this, hang tight" first message
- [ ] Hexagram visual (六爻图) instead of text
- [ ] Backup demo video recorded

Done = both P0 boxes checked AND a backup recording exists.

---

## 13. Pitch Script Hooks (so engineering and pitch are coupled)

The 90-second pitch (PDF §14) commits us to these literal claims. Engineering must make them true:

| Claim | Engineering anchor |
|---|---|
| "I just texted a number" | Photon webhook accepts incoming SMS |
| "It asked one good question" | State machine turn 1 forces `action=ask` (rule 1) |
| "Fifteen minutes later, my phone buzzed" | Pipeline + Photon outbound |
| "It picked the hexagram Wei Ji" | LLM divination prompt outputs gua_name |
| "Then it turned my dream into this" | PixVerse video plays on `/dream/{id}` |
| "Two strangers also dreamt of crossing water last night" | Resonance returns exactly 2 matches; both within 24h or fallback to 7d; both share "water" or "river" key_imagery |
| "We don't know each other" | masked phone display only |
| "Photon gives it a voice. HydraDB gives it a memory. PixVerse gives it eyes." | All three deeply integrated, none mocked at demo time |

---

🍵 *Build well. Ship weird. Touch grass.*
