# DreamWeaver Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (separate session) or `superpowers:subagent-driven-development` (this session) to implement this plan task-by-task. **Hackathon mode — task = functional closure, not 5-step TDD.** Tests only at smoke gates (📌 markers).

**Goal**: Ship DreamWeaver in 4 hours of hacking → win Best Agent using video models & memory (HydraDB+PixVerse) and Best Project.

**Architecture**: FastAPI backend with abstracted `MemoryStore` (LocalMemoryStore as dev fallback / HydraDBMemoryStore via httpx Bearer). 3-step LLM chain via GMI (extract → divine → cinematic prompt). Async pipeline via `asyncio.gather` runs PixVerse poll + embed/HydraDB insert in parallel. SMS I/O via Photon. Static Jinja `/dream/{id}` page renders gua + video + 2 resonance cards.

**Tech Stack**: Python 3.11+, FastAPI 0.110+, uvicorn (single worker), httpx, Pydantic v2, OpenAI SDK (embeddings only), GMI Cloud (OpenAI-compatible LLM), PixVerse REST, HydraDB REST (Bearer auth, no SDK), Jinja2, Cloudflare Tunnel.

**Wall-clock anchors** (T+0:00 ≈ workshop start ~9:00 PT):
| T+ | Wall-clock | Milestone |
|---|---|---|
| T+0:00 | ~9:00 | Workshop start |
| T+1:00 | ~10:00 | 🟢 Hacking start |
| T+2:00 | ~11:00 | LocalStore smoke (Stage-1) preferred |
| T+3:00 | ~12:00 | 📌 HydraDB smoke (Stage-2) — demo命脉 gate |
| T+3:30 | ~12:30 | 📌 End-to-end smoke (Stage-3) — full pipeline gate |
| T+4:00 | ~13:00 | Polish window opens |
| T+5:00 | ~14:00 | 🚨 **P0 FREEZE** — no new features |
| T+5:30 | ~14:30 | 📌 Backup video recorded |
| T+6:30 | ~15:30 | Final stop |
| ~16:30 | — | Demo |

> *Wall-clock is approximate; relative T+ ordering is what matters. The 14:00 P0 freeze is sacred regardless of when hacking actually started.*

**Owners**:
- **A** = Backend / Agent pipeline (webhook, LLM, PixVerse, Photon, observability) + on-stage speaker
- **B** = Memory / Frontend / Demo materials (HydraDB integration, seed dreams, HTML, video pre-gen, backup recording) + on-stage screen driver

**Markers**: 🚨 critical path · ⚠️ degradable · 🔄 parallelizable · 📌 milestone gate

---

## Phase 0 — Workshop & Setup (T+0:00 — T+1:00)

Both attend workshops, collect API keys, install tunnel tools, align on schema before hacking starts.

| ID | Owner | Time | Deps | Description | Acceptance |
|---|---|---|---|---|---|
| **T0.1** 🚨 | Both | 30m | — | Attend GMI / PixVerse / HydraDB / Photon workshops; capture key takeaways | All 4 sessions attended; quick notes on each |
| **T0.2** 🚨 | A | 5m | T0.1 | Get GMI API key + base_url + model name; fill `.env` | `GMI_API_KEY`, `GMI_BASE_URL`, `GMI_MODEL` set |
| **T0.3** 🚨 | A | 5m | T0.1 | Get Photon API key + outbound base URL + sender number; fill `.env`; whitelist speaker's phone (and backup phone) | `PHOTON_*` vars set; whitelist confirmed in Photon dashboard |
| **T0.4** ⚠️ | A | 5m | T0.1 | Confirm HydraDB API specifics: filter operators (`$ne`, `$gte`), keyword/text filter for hybrid, metadata size limit | Notes captured. If `$ne` unsupported → over-fetch + Python post-filter (already designed). If keyword filter unsupported → §17.4 pitch fallback to version B |
| **T0.5** 🚨 | A | 10m | — | Get OpenAI API key (personal or hackathon-issued); fill `.env`; smoke test embedding works | `python -c "from openai import OpenAI; print(len(OpenAI().embeddings.create(model='text-embedding-3-small', input='test').data[0].embedding))"` prints 1536 |
| **T0.6** | A | 5m | — | Install Cloudflare Tunnel: `brew install cloudflared && cloudflared tunnel login` | `cloudflared --version` works |
| **T0.7** ⚠️ | A | 5m | — | Install ngrok backup: `brew install ngrok` | `ngrok --version` works |
| **T0.8** | B | 10m | — | Verify QuickTime iPhone screen mirror via Lightning cable | iPhone visible in QuickTime → File → New Movie Recording |
| **T0.9** | B | 5m | — | Charge backup phone; both phones >50% battery, hotspot capable | Confirmed |
| **T0.10** | Both | 10m | — | Read `docs/plans/2026-05-02-dreamweaver-design.md` together; lock soulmate text in §8.1 (no more changes) | Both can recite the demo dream pitch text verbatim |
| **T0.11** 🔄 | Both | 5m | T0.5 | Bootstrap project: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt` | `python -c "import fastapi, openai, numpy, jinja2, httpx"` no errors |

**Phase 0 Risk Register**:

| Risk | Trigger | Action |
|---|---|---|
| GMI workshop overruns | Workshop > 45 min | A leaves at T+0:45, picks up key from booth at break |
| HydraDB doesn't support `$ne` filter | T0.4 confirms | Plan B in code: over-fetch top 20, post-filter `exclude_user` in Python (5 min change to `find_resonance`) |
| OpenAI key not allocated | No personal key + hackathon doesn't provide | Worst case: install `sentence-transformers` locally (~10 min download); accept lower quality |

---

## Phase 1 — Vacuum Period (T+1:00 — T+2:00)

A and B work fully in parallel using `LocalMemoryStore` (no HydraDB calls yet — even though HYDRA_API_KEY is set, MEMORY_BACKEND=local). Goal: prove webhook + LLM state machine + seed + HTML can run end-to-end against local backend.

### A — Backend skeleton + Photon + state machine

| ID | Owner | Time | Deps | Description | Files | Acceptance |
|---|---|---|---|---|---|---|
| **T1.A1** 🚨 | A | 15m | T0.5 | Write `backend/main.py`: FastAPI app + `lifespan` (warm OpenAI + auto-seed local store) + skeleton endpoints `/sms-webhook`, `/dream/{id}`, `/admin/status/{phone}` returning placeholders | Create: `backend/__init__.py`, `backend/main.py` | `uvicorn backend.main:app --reload --port 8000` boots; lifespan logs "warmup complete" |
| **T1.A2** 🚨 | A | 10m | — | Write `backend/photon_client.py`: async `send_sms(to, body)` via httpx; uses `PHOTON_*` env | Create: `backend/photon_client.py` | `python -c "import asyncio; from backend.photon_client import send_sms; asyncio.run(send_sms('+1xxx', 'hi'))"` returns 200 (or 401 if not whitelisted — OK for now) |
| **T1.A3** 🚨 | A | 25m | T1.A1 | Write `backend/conversation.py`: in-memory `_sessions` dict + `handle_sms(phone, body) → (reply_msg, dream_msgs_or_none)` + JSON state machine prompt + 3-turn hard cap + retry-once-then-force-process fallback (per design doc §6 + decision #11) | Create: `backend/conversation.py` | `handle_sms("+1t", "I had a dream")` returns ask reply; 3rd call returns `("Got it...", [3_msgs])` |
| **T1.A4** | A | 10m | T1.A1, T1.A3 | Wire `/sms-webhook` → call `handle_sms` → send reply via `photon_client.send_sms` → return `{"ok": true}` <1s. No pipeline yet. | Modify: `backend/main.py` | `curl -X POST http://localhost:8000/sms-webhook -H 'Content-Type: application/json' -d '{"from":"+1t","body":"I dreamt..."}'` returns 200 in <1s |

### B — Seed + LocalStore find_resonance + HTML + PixVerse pre-gen

| ID | Owner | Time | Deps | Description | Files | Acceptance |
|---|---|---|---|---|---|---|
| **T1.B1** 🚨 | B | 25m | — | Implement `memory/local_store.py::find_resonance` per design doc §15: elastic two-tier (24h strict → 7d fallback) + no threshold + time-decay τ=48h + top_k=2; returns `ResonanceMatch` list using `_mask_phone` | Modify: `memory/local_store.py` | Manual unit test: 5 fake Dreams w/ varied timestamps, `find_resonance(emb, exclude="+1self", k=2)` returns 2 sorted by `cosine × exp(-Δh/48)` |
| **T1.B2** 🚨 | B | 25m | — | Write `memory/seed.py`: 10 dreams (soulmate_1, soulmate_2 verbatim from design doc §8.1; 8 distractors from PDF §10 translated to English). Timestamps: 8 in 24h window (`now - U(2,20)h`), 2 in 7d window (`now - U(2,5)d`). `seed_all(store)` async, computes embedding per dream via `build_embedding_input`, inserts. Export `SOULMATE_1_ID` and `SOULMATE_2_ID` constants. | Create: `memory/seed.py` | `python -c "import asyncio; from memory import get_store; from memory.seed import seed_all; asyncio.run(seed_all(get_store()))"` finishes; 10 Dreams in `_dreams` |
| **T1.B3** 🔄 | B | 15m | — | Write `templates/dream.html`: Jinja skeleton (gua name + interpretation + video tag + 2 resonance card divs). Mobile-first, dark theme, video autoplay muted | Create: `templates/dream.html` | Open in browser shows 1 main + 2 cards layout (no live data yet) |
| **T1.B4** ⚠️ | B | 10m | — | Write `backend/pixverse_client.py`: async `submit(prompt) → job_id` and `poll_until_done(job_id, max_wait_s=90) → video_url` via httpx; 5s polling interval | Create: `backend/pixverse_client.py` | `python -c "import asyncio; from backend.pixverse_client import submit, poll_until_done; jid=asyncio.run(submit('a peaceful zen pond')); print(asyncio.run(poll_until_done(jid)))"` returns a URL |
| **T1.B5** ⚠️ | B | 30m | T1.B4 | Write & run `scripts/pre_generate_videos.py`: generate 2 PixVerse videos (demo main + soulmate_1 prompts). Save URLs as constants `DEMO_VIDEO_URL`, `SOULMATE_1_VIDEO_URL` in `memory/seed.py` | Create: `scripts/pre_generate_videos.py`; modify: `memory/seed.py` | Both URLs returned and play in browser |

### Phase 1 closeout — Stage-1 smoke (LocalStore)

| ID | Owner | Time | Deps | Description | Acceptance |
|---|---|---|---|---|---|
| **T1.S** 📌 | B | 10m | T1.B1, T1.B2, T2.A2 (or stub LLM extract) | Write `scripts/verify_resonance.py` per design doc §15. **Stage 1 run: against LocalMemoryStore.** Asserts top-1 == `SOULMATE_1_ID`, top-2 == `SOULMATE_2_ID`. (Note: needs `extract_structured` working; if T2.A2 not yet done, hand-craft Structured for the demo dream temporarily.) | Run prints "✅ Resonance smoke test passed" + cosine scores |

**Phase 1 Risk Register**:

| Risk | Trigger | Action |
|---|---|---|
| Stage-1 smoke fails (top-1 wrong) | T1.S asserts fail | (a) tighten `soulmate_1` imagery overlap; (b) edit distractor texts to remove `water/river/calling`. Iterate within 15 min. |
| PixVerse rate-limits or fails | T1.B5 timeout > 5 min | Use `PLACEHOLDER_VIDEO_URL` for both seed videos; demo runs but resonance card 1 has placeholder. ⚠️ degraded but acceptable. |
| `handle_sms` JSON parse fails repeatedly | T1.A3 manual test | Tighten prompt schema description; pass `response_format={"type":"json_object"}` to GMI. If still flaky: short-circuit to single-turn (decision #11 fallback). |

---

## Phase 2 — SDK Integration (T+2:00 — T+3:00)

A wires GMI LLM clients (3 calls). B replaces LocalMemoryStore with HydraDBMemoryStore via httpx + Bearer.

### A — GMI LLM clients

| ID | Owner | Time | Deps | Description | Files | Acceptance |
|---|---|---|---|---|---|---|
| **T2.A1** 🚨 | A | 15m | T0.2 | Write `backend/prompts.py`: 4 prompt template constants — `STATE_MACHINE_PROMPT` (move from T1.A3), `EXTRACT_STRUCTURED_PROMPT` (with **forced English summary** rule per decision #8), `DIVINE_PROMPT`, `CINEMATIC_PROMPT` | Create: `backend/prompts.py` | English-summary constraint explicit in `EXTRACT_STRUCTURED_PROMPT`; all 4 importable |
| **T2.A2** 🚨 | A | 25m | T2.A1 | Write `backend/gmi_client.py`: `extract_structured(messages) → Structured`, `divine(structured) → Divination`, `cinematic_prompt(structured, divination) → str`, `warmup()` for lifespan. Async, `openai.AsyncClient` with GMI base_url. JSON outputs parsed via Pydantic. Retry once on parse failure. | Create: `backend/gmi_client.py` | Smoke: `python -c "import asyncio; from backend.gmi_client import extract_structured; print(asyncio.run(extract_structured(['I dreamt of water'])))"` returns Structured with English summary |
| **T2.A3** | A | 5m | T2.A2 | Wire `gmi_client.warmup()` into FastAPI lifespan in `backend/main.py` | Modify: `backend/main.py` | uvicorn boot logs include "gmi warmup ok" |

### B — HydraDB integration

| ID | Owner | Time | Deps | Description | Files | Acceptance |
|---|---|---|---|---|---|---|
| **T2.B1** 🚨 | B | 15m | — | Spike HydraDB API: `curl -H "Authorization: Bearer $HYDRA_API_KEY" https://api.hydradb.com/...` against Quickstart endpoints. Confirm: namespace creation, vector upsert syntax, query syntax, supported filter operators | None (research) | Notes: confirmed endpoints & JSON shape for upsert + query + delete |
| **T2.B2** 🚨 | B | 30m | T2.B1 | Implement `memory/hydra_store.py`: httpx async client with Bearer auth header; methods `insert(dream)`, `get(id)`, `list_by_user(phone)`, `find_resonance(emb, exclude, k, within)`. Mirror LocalMemoryStore semantics (24h → 7d fallback, time-decay τ=48h, top_k=2, no threshold). Hybrid: include `key_imagery` joined as keyword filter if T2.B1 confirms support; else vector + metadata only (§17.4 pitch fallback) | Modify: `memory/hydra_store.py` | Smoke: insert 1 dream + get round-trip + 1 query returns ≥0 results without exception |
| **T2.B3** 🚨 | B | 10m | T2.B2 | Switch `MEMORY_BACKEND=hydra` in `.env`; re-run `seed.py` to populate HydraDB with 10 dreams | Modify: `.env`; rerun seed | All 10 Dreams visible via `curl` to HydraDB list/query endpoint |
| **T2.B4** | B | 5m | T2.B3 | Confirm `SOULMATE_1_ID` and `SOULMATE_2_ID` consts in `memory/seed.py` are stable across reruns (use deterministic IDs, e.g. `"soulmate_1"`, not random uuid4 for these two) | Modify: `memory/seed.py` | Reseeding gives same IDs for soulmates |

### Phase 2 closeout — Stage-2 smoke (HydraDB) 📌

| ID | Owner | Time | Deps | Description | Acceptance |
|---|---|---|---|---|---|
| **T2.S** 📌🚨 | B | 10m | T2.A2, T2.B3, T2.B4 | Re-run `scripts/verify_resonance.py` against HydraDB (`MEMORY_BACKEND=hydra`). **This is the demo's life-or-death test.** Top-1 must == `SOULMATE_1_ID`, top-2 must == `SOULMATE_2_ID` | Run prints "✅ Resonance smoke test passed" with cosine scores logged |

**Phase 2 Risk Register**:

| Risk | Trigger | Action |
|---|---|---|
| HydraDB filter syntax differs from spike | T2.B2 query returns 0 | Read response error, adjust filter JSON. After 15 min stuck → switch to over-fetch + Python post-filter |
| Stage-2 smoke fails but Stage-1 passed | T2.S top-k wrong | Bug isolated to HydraDB layer (not seed/embedding). Compare LocalStore vs HydraDB result objects; likely cause: HydraDB scoring/normalization differs |
| GMI JSON output drifts (markdown fences, extra text) | T2.A2 returns malformed JSON > 50% of calls | Strengthen prompt: "RETURN ONLY JSON, NO MARKDOWN FENCES". Add regex cleanup before parse |

---

## Phase 3 — End-to-End Wiring (T+3:00 — T+3:30)

Glue everything: pipeline.py + observability + webhook background task. Run full e2e from `curl` POST to receiving SMS link.

| ID | Owner | Time | Deps | Description | Files | Acceptance |
|---|---|---|---|---|---|---|
| **T3.1** 🚨 | A | 5m | — | Write `backend/observability.py`: stdlib logging config + `pipeline_state: dict[str, dict]` + `update_state(phone, step, **extra)` per design doc §17.1 | Create: `backend/observability.py` | Importable; `update_state("+1x", "test")` logs to stderr |
| **T3.2** 🚨 | A | 25m | T3.1, T2.A2, T1.B4, T2.B2 | Write `backend/pipeline.py::process_dream_pipeline(phone, raw_messages)` per design doc §5.2 + decision #12: serial LLM chain → PixVerse submit → `asyncio.gather(get_embedding, poll_pixverse, return_exceptions=True)` → fallback handling (zero vec / placeholder URL) → `store.insert()` with HydraDB→Local fallback → `photon.send_sms(link)`. `update_state` between steps. | Create: `backend/pipeline.py` | Importable; type-checked with mypy `--strict` (optional) |
| **T3.3** 🚨 | A | 10m | T3.2, T1.A4 | Update `/sms-webhook`: when `handle_sms` returns `dream_msgs`, append `process_dream_pipeline(phone, dream_msgs)` to `BackgroundTasks` | Modify: `backend/main.py` | webhook still returns <1s; pipeline runs async after |
| **T3.4** 🚨 | A | 5m | T3.1 | Implement `/admin/status/{phone}` returning `pipeline_state.get(phone, {"step":"idle"})` | Modify: `backend/main.py` | `curl /admin/status/+1xxx` returns JSON |
| **T3.5** 🚨 | B | 15m | T3.2 | Implement `/dream/{id}`: load Dream from `get_store()`, call `find_resonance(dream.embedding, exclude=dream.user_phone, k=2)`, render `dream.html` with all data | Modify: `backend/main.py`, `templates/dream.html` (data bindings) | `curl /dream/<seed_dream_id>` returns HTML with non-empty fields and 2 resonance cards |
| **T3.6** 📌🚨 | Both | 15m | T3.3, T3.5 | **Stage-3 end-to-end smoke**: `curl -X POST /sms-webhook` with demo dream text. Watch `/admin/status/+1xxx` step transitions in browser. Wait for SMS; click link; see dream page render with gua + video + 2 resonance cards | Full happy path completes <90s; no exceptions in logs |

**Phase 3 Risk Register**:

| Risk | Trigger | Action |
|---|---|---|
| `asyncio.gather` exception leaks past `return_exceptions=True` | T3.2 first run | Verify `isinstance(x, Exception)` checks before using each result; never raise inside gather'd coro |
| Pipeline finishes but Photon SMS not arriving | T3.6 SMS doesn't show | Check Photon dashboard outbound queue; verify whitelist; fallback: log link to stdout for B to manually open |
| `/dream/{id}` 404 on freshly-inserted dream_id | T3.6 click 404 | Race: HydraDB insert returned but read is eventually-consistent. Add 1s sleep before Photon SMS, or confirm HydraDB ack means readable |

---

## Phase 4 — Polish & Hardening (T+3:30 — T+4:00)

A on backend resilience, B on visual polish. **No new features** — only verifying fallbacks and improving UI.

### A — Backend resilience verification

| ID | Owner | Time | Deps | Description | Files | Acceptance |
|---|---|---|---|---|---|---|
| **T4.A1** ⚠️ | A | 10m | T3.2 | Verify PixVerse 90s timeout fallback: monkey-patch `poll_until_done` to raise `TimeoutError`, confirm pipeline uses `PLACEHOLDER_VIDEO_URL` and completes | Modify if needed: `backend/pipeline.py` | Forced timeout test: dream rendered with placeholder video, no crash |
| **T4.A2** ⚠️ | A | 10m | T3.2 | Verify HydraDB→Local fallback: temporarily set `HYDRA_API_KEY=invalid`, run pipeline, confirm dream stored in LocalStore (transparent to user) | Modify: `backend/pipeline.py` if needed | Pipeline finishes without exception; dream visible via `/dream/{id}` |
| **T4.A3** | A | 10m | T3.1 | Verify lifespan pre-warming: time first SMS pipeline step. Should be <2s if warm, >4s if cold. | None (measurement) | First-SMS latency <2s |

### B — Visual polish

| ID | Owner | Time | Deps | Description | Files | Acceptance |
|---|---|---|---|---|---|---|
| **T4.B1** ⚠️ | B | 15m | T3.5 | Polish `templates/dream.html`: gua name large 60pt serif + interpretation paragraph + autoplay-muted video + 2 stacked resonance cards (card 1 has video, card 2 text-only with masked phone + relative time "6 hours ago") | Modify: `templates/dream.html` | Open dream page in iPhone Safari, looks clean and readable, no horizontal scroll |
| **T4.B2** ⚠️ | B | 10m | T4.B1 | Add hexagram visual: use unicode 64-hexagram block (U+4DC0–U+4DFF) for the gua. Fallback to gua name only if not rendering | Modify: `templates/dream.html` | "未济" shows as ䷿ (or fallback text) |
| **T4.B3** | B | 5m | T4.B1 | Add 404 fallback for `/dream/{id}` not found: simple "Dream not found, did you misclick?" page | Modify: `backend/main.py`; create: `templates/404.html` | `curl /dream/bogus` returns 404 with friendly page |

**Phase 4 Risk Register**:

| Risk | Trigger | Action |
|---|---|---|
| PixVerse fallback didn't trigger correctly | T4.A1 hangs > 90s | Confirm `asyncio.wait_for` or polling loop has hard cap; force return placeholder |
| Visual polish ate too much time | T4.B1 not done by T+4:00 | Skip T4.B2 (hexagram unicode); ship with gua name only — pitch still works |
| First-SMS latency still >3s | T4.A3 measure | Acceptable for demo; speaker can fill the silence with pitch text |

---

## Phase 5 — Hard Freeze & Rehearsal (T+4:00 — T+5:30)

🚨 **T+4:00 is P0 FREEZE. NO new features. Only bug fixes and rehearsal.** 🚨

| ID | Owner | Time | Deps | Description | Acceptance |
|---|---|---|---|---|---|
| **T5.1** 🚨 | Both | 30m | All P0 | End-to-end smoke from speaker's actual phone (not curl). Identify any bugs. **Fix only — no new code.** | Real phone → SMS → reply → link → page renders correctly with 2 resonance cards |
| **T5.2** 📌🚨 | B | 15m | T5.1 | **Record backup demo video** per design doc §17.6: split-screen iPhone + Mac via QuickTime, A reads pitch script as voiceover, output 1080p mp4, save to Desktop AND iCloud | `~/Desktop/dreamweaver-backup-90s.mp4` exists, plays cleanly |
| **T5.3** | A | 5m | T5.2 | Decide hybrid pitch version (A or B per design doc §17.4) based on what HydraDB SDK supported in T2.B1; print pitch card or write in Notes app | Pitch card v1 (hybrid supported) or v2 (vector + metadata only) in hand |
| **T5.4** 🚨 | Both | 15m | T5.1 | **Rehearsal #1**: full demo with timing. A speaks/holds phone, B drives screen per design doc §17.5. Time each section, identify slow points. | Total < 90s; all 4 sponsors mentioned in final 15s |
| **T5.5** | Both | 15m | T5.4 | **Rehearsal #2**: post-feedback adjustments. Final pitch tweaks. | Smooth run; both confident |
| **T5.6** | Both | 10m | T5.5 | Buffer: extra rehearsal, restroom, snacks, charging | Both phones >70%, laptops >50%, water bottles full |

**Phase 5 Risk Register**:

| Risk | Trigger | Action |
|---|---|---|
| Bug discovered in T5.1 needing > 30 min fix | After T+4:30 | Decision point: ship buggy live + lean on backup video; OR stop fixing, run with degraded feature (e.g. drop hybrid pitch) |
| Backup video recording fails | T5.2 mp4 corrupted or audio out of sync | Re-record once. If second fail: raw screen-record without voiceover; A narrates live |
| Speaker forgets pitch line | Rehearsal #2 stumbles | Print pitch script on paper; tape to laptop edge for reference |

---

## Done Definition

### P0 (must ship by T+5:00 / 14:00 freeze)

- [ ] User SMS → agent reply (handle_sms returns ack within webhook 1s) — **T1.A4**
- [ ] LLM JSON state machine working (3-turn cap respected; failures fall to process) — **T1.A3**
- [ ] LLM extracts Structured + divines Divination + writes cinematic prompt (3 GMI calls succeed) — **T2.A2**
- [ ] PixVerse generates a real video for live SMS, OR placeholder URL on timeout — **T1.B4 + T4.A1**
- [ ] HydraDB stores Dream with embedding + metadata; HydraDB→LocalStore fallback verified — **T2.B2 + T4.A2**
- [ ] HydraDB returns ≥ 2 resonance matches for demo dream (verified by smoke test) — **📌 T2.S**
- [ ] Static `/dream/{id}` page renders gua + video + 2 resonance cards — **T3.5**
- [ ] Photon outbound sends link via SMS to whitelisted speaker phone — **T3.2 + T0.3**
- [ ] 10 seed dreams loaded in HydraDB — **T2.B3**
- [ ] BackgroundTasks pipeline runs end-to-end without blocking webhook — **📌 T3.6**
- [ ] Backup demo video recorded — **📌 T5.2**

### P1 (nice-to-have, only if T+4:00 reached early)

- [ ] Soulmate_1 has pre-generated PixVerse video on resonance card 1
- [ ] Hybrid search wired through (vector + key_imagery filter, version A pitch)
- [ ] Hexagram visual on dream page (unicode block)
- [ ] `/admin/status/{phone}` polished as live debug dashboard (auto-refresh)
- [ ] Time-decay τ verified empirically (different τ values produce different rankings)

**Done = ALL P0 boxes checked AND backup recording exists.**

---

## Skill Handoff

**Plan complete and saved to `docs/plans/2026-05-02-dreamweaver-implementation-plan.md`. Two execution options:**

### 1. Subagent-Driven (this session)
I dispatch fresh subagent per task, review between tasks, fast iteration in this conversation. Best for solo developer or when both A and B share one Claude session. Uses `superpowers:subagent-driven-development`.

### 2. Parallel Sessions (recommended for real 2-person hackathon)
Open a **second** Claude Code terminal in this same worktree. A runs their session for backend tasks (T*.A*); B runs their session for memory/frontend tasks (T*.B*). Both sessions invoke `superpowers:executing-plans` and reference this plan. I (this session) stay available for cross-cutting coordination, debug help, design questions.

**Why option 2 is recommended**: This is a 4-hour hackathon with two real humans. Each human + Claude pair becomes a true execution unit. Sequential subagent dispatch (option 1) under-utilizes B while A's tasks run.

**Which approach?**
