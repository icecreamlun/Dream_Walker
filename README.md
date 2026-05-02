# Dream Walker

> *A ledger of nocturnal images, kept in plain ink.*

**Dream Walker turns your dreams into cinematic videos — entirely through iMessage.**

Text last night's dream to a number. Half-asleep and barely coherent? Tap iMessage's dictation key and mumble — iOS transcribes on-device and Dream Walker reads the words that arrive. The agent asks one gentle clarifying question if you've left something hanging, then interprets your dream through the symbolism of the **I Ching** (周易), selects the hexagram that fits, and rewrites your half-remembered fragments into a cinematic prompt.

Seconds later, you get back a 5-second surreal film of your dream — generated with **PixVerse on GMI Cloud** — and a passage of interpretation rooted in two thousand years of Chinese divination.

Every dream becomes a node in **HydraDB**, a living memory layer. Over time, Dream Walker surfaces *resonance* — uncanny overlaps between your dreams and a stranger's, in symbols, emotions, and places you'd never consciously connect. *Two strangers dreamt of the same river last night.*

Every dream lives at its own link. Forward it in iMessage and your friends watch it inline — no install, no app, no friction.

Built on **Photon** (iMessage agent layer), **GMI Cloud** (LLM + inference), **PixVerse** (video), and **HydraDB** (memory).

> Just text. Dream. Resonate.

---

## Try it in thirty seconds

Text any dream to **+1 (415) 605-7073** from a registered iPhone. *(Registration is one HTTP call — see [Setup](#setup).)*

You'll get back two messages: an immediate acknowledgement, then — about thirty seconds later — a link. Tap the link and your dream plays back to you as a film, with its hexagram and its echoes from across the archive.

---

## How it actually works

```
        ┌──────────────────────────────┐
        │      Apple iMessage          │
        │   (you, half-asleep)         │
        └──────────────┬───────────────┘
                       │  ① text or dictated voice
                       ▼
        ┌──────────────────────────────┐
        │  Photon Spectrum  (gRPC)     │  ◄── outbound long-stream;
        │  +1 (415) 605-7073           │      no webhook needed
        └──────────────┬───────────────┘
                       ▼
   ┌──────────────────────────────────────────────┐
   │  Dream Walker  (Node agent)                  │
   │                                              │
   │  ② state-machine: ask once if too short      │
   │  ③ GMI LLM (Qwen3-Next) — structured extract │
   │  ④ GMI LLM — I Ching divination (64 卦)      │
   │  ⑤ GMI LLM — cinematic prompt rewrite        │
   │  ⑥ moderation auto-retry  ── on trademark    │
   │     blocks, the LLM rewrites and retries     │
   │  ⑦ PixVerse v5.6 t2v on GMI Cloud — 5s clip  │
   │  ⑧ HydraDB insert + resonance recall (top-2) │
   └──────────────┬───────────────────────────────┘
                  ▼
         ✨  link back via Photon  ──►  iMessage
                                    ──►  /dream/:id  (web ledger)
```

End-to-end: ~30–45 seconds from sending a dream to receiving the film.

---

## What makes it actually good

**Conversational, not just a one-shot.** A short or vague message ("I had a weird dream") gets one gentle clarifying question — never an interrogation. Long, vivid dreams skip the question and go straight to render.

**Cross-channel memory.** Send a dream by SMS, then walk back to your laptop and ask the agent *"what did the river mean?"* — same conversation thread. The web ledger and your iMessage agent share state through HydraDB.

**Real I Ching, not vibes.** Each dream selects from the 64 hexagrams. The interpretation is a single passage — warm, never clinical, written like a curious friend with a dream journal.

**Resonance with strangers.** HydraDB scores each dream against everyone else's by cosine × time-decay. The dream page surfaces the top two anonymous matches: *"Two strangers also dreamt of crossing water last night."* No cold-start problem — ten archetypal seed dreams are pre-loaded so resonance fires from the very first user.

**Trademark-aware video.** PixVerse blocks branded names. When that happens, the agent silently rewrites the prompt — *"SpongeBob in Bikini Bottom"* becomes *"a cheerful yellow square sea creature in an underwater town"* — and retries. Demo doesn't break.

**Link-native sharing.** Every dream lives at a stable URL. Forward it in iMessage and the recipient sees the film inline. No app to install, no account to create.

---

## The stack

| Sponsor | Role |
|---|---|
| **Photon** ([spectrum.photon.codes](https://spectrum.photon.codes)) | iMessage agent layer — outbound gRPC stream, shared phone-pool routing, zero webhook setup |
| **GMI Cloud** ([gmicloud.ai](https://gmicloud.ai)) | LLM inference (Qwen3-Next-80B) for understanding, divination, prompt rewriting; also hosts PixVerse t2v |
| **PixVerse** (`pixverse-v5.6-t2v`) | 5-second cinematic video generation, called via GMI's request queue |
| **HydraDB** ([hydradb.com](https://hydradb.com)) | Vector memory layer — insert every dream as a memory, recall by semantic similarity for resonance |

One GMI API key powers both the LLM pipeline and the t2v generation. Photon and HydraDB each take a project-id / api-key pair — that's it.

---

## Setup

```bash
git clone https://github.com/<you>/Dream_Walker.git
cd Dream_Walker
cp .env.example .env       # fill in the four credentials
npm install
```

Required env vars:

```bash
GMI_API_KEY=…                 # for both LLM and t2v
GMI_LLM_MODEL=Qwen/Qwen3-Next-80B-A3B-Instruct
PHOTON_PROJECT_ID=…
PHOTON_PROJECT_SECRET=…
HYDRA_API_KEY=…
HYDRA_NAMESPACE=dream_walker  # tenant in HydraDB
PUBLIC_URL=https://your.ngrok-free.app
```

### One-time onboarding for a demo phone

```bash
npm run register -- +1XXXXXXXXXX
```

Photon assigns the phone a number from its shared iMessage pool and prints a deep-link the user opens once on their iPhone — iMessage launches with the right recipient pre-filled. The phone is then permanently associated with this project.

### Run it

```bash
ngrok http 8000           # in one terminal
npm run dev               # in another — boots the agent + web server
```

You'll see, in order:

```
[llm] warmup ok
[hydra] tenant ready
http://localhost:8000  (public: https://xxxx.ngrok-free.app)
Spectrum app running. Listening for iMessage…
```

Once those four lines are out, the agent is live. Text a dream.

---

## Smoke tests

```bash
npm run test:pixverse    # one t2v call → confirm video URL + thumbnail
npm run test:photon      # connect to Spectrum + echo every incoming text
npm run test:hydra       # insert/recall/self-exclusion round-trip
npm run verify-resonance # confirm the demo dream's top-1 match is soulmate_1
npm run seed             # load 10 archetypal dreams into HydraDB
```

A green `verify-resonance` is the demo's life-or-death test — it proves the showcase prompt ("river / calling / can't cross") actually returns the matching seed as top-1.

---

## Demo prompts

Three dreams, each chosen for a different resonance profile:

1. **Soulmate-1 hit** *(strongest single match)*
   > *"I dreamt I was on the wrong side of a wide river. Someone in white was calling my name from the far shore, but the water was too wide to cross."*

2. **Triple resonance** *(visually striking, hits three seeds at once)*
   > *"I dreamt the moon fell into the lake, and I dove in to catch it. As I sank deeper, the water turned silver and started singing my name."*

3. **Family + childhood** *(deep divination, single match)*
   > *"I dreamt a giant tree was growing inside my childhood home. Its roots cracked through the kitchen floor, its branches pushed the ceiling open, but my family kept eating dinner like nothing was wrong."*

Each is over 100 characters — the deterministic state-machine gate sends them straight to render without asking for more detail. Shorter inputs trigger the gentle one-question follow-up.

---

## Project layout

```
src/
  index.ts            iMessage handler + main loop
  server.ts           Express: /, /chat, /dream/:id, /dreams.json
  render-pipeline.ts  shared LLM→PixVerse→HydraDB pipeline
                      (used by both iMessage and web entrypoints)
  llm.ts              GMI Qwen3-Next: extract / divine / cinematic /
                      sanitize / state-machine, with retry on 5xx
  hydra.ts            HydraDB client — memory insert + resonance recall
                      with cosine × exp(-Δh/48) time decay
  photon.ts           Spectrum app bootstrap
  pixverse.ts         GMI request-queue submit + poll
  chat.ts             web chat agent (cross-channel context)
  conversation.ts     persisted per-user message log

public/
  index.html          ledger + chat (EB Garamond + IBM Plex Mono)
  dream.html          single-dream page with video + hexagram + resonance

scripts/
  register-user.ts    one-time phone enrolment with Photon
  seed.ts             load 10 archetypal dreams into HydraDB
  test-*.ts           per-service smoke tests
  verify-resonance.ts demo pre-flight check
  demo.ts             feed a synthetic dream through the full pipeline
```

---

## Roadmap

- **Native voice attachments** — currently iMessage's on-device dictation handles voice→text before the message reaches us. Direct audio-attachment ingestion (Whisper or similar via GMI) is the next step, so the agent can hear tone and pacing, not just words.
- **Recurring-symbol summaries** — weekly digest of the user's own archive ("you've dreamed of water seven times this month").
- **Group dream rooms** — opt-in shared namespaces for friend groups who want to surface resonance only within each other's dreams.

---

## Credits

Built at **Build Matcha & Code** — GMI Cloud, San Francisco, 2026·05·02.

Photon · GMI Cloud · PixVerse · HydraDB.

🌙 Just text. Dream. Resonate.
