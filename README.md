# Dream Walker 🌙🍵

Hackathon project — Build Matcha & Code · 2026-05-02

User texts a dream → GMI Cloud runs `pixverse-v5.6-t2v` → Photon sends a link back via iMessage.

HydraDB is intentionally not in the loop yet. This is the **minimum end-to-end pipeline** to prove out the demo: text in → video out. One GMI call satisfies both the GMI and PixVerse sponsor tracks.

> Read [PRODUCT_PLAN.md](./PRODUCT_PLAN.md) for the full hackathon plan and division of labor.

## What's wired up

```
iMessage  ─►  Photon Spectrum  ─►  Node backend  ─►  PixVerse  ─►  video URL
                                       │                              │
                                       └────►  data/dreams.json  ◄────┘
                                                    │
                                       http://localhost:8000/dream/<id>
                                                    ▲
                                                    │
                              SMS reply with link  ─┘
```

- `src/photon.ts` — connects to Spectrum (auto-discovers shared address, auto-refreshes token)
- `src/pixverse.ts` — t2v submit + poll against GMI's request queue (`pixverse-v5.6-t2v`)
- `src/store.ts` — file-backed dream archive (`data/dreams.json`)
- `src/server.ts` — `/dream/:id` page that auto-refreshes until the video lands
- `src/index.ts` — orchestrator: subscribe → ack → generate → reply with link

## Setup

```bash
cp .env.example .env       # secrets are pre-filled; verify before publishing
npm install
```

## Smoke test in 3 steps

### 1. GMI t2v only (no iMessage needed)

```bash
npm run test:pixverse -- "I dreamt I was flying over a glass ocean"
```

Submits to GMI's request queue and polls until `success`. Verified working —
returns a video URL + thumbnail in ~30s.

### 2. Photon connection only (no PixVerse needed)

```bash
npm run test:photon
```

Should print `Connected.` and then sit idle. Spectrum handles address
discovery and token rotation for our shared project.

### 3. Register your phone, then full end-to-end

```bash
# one-time per phone — assigns you a Photon-pool number to text
npm run register -- +14155551234

# starts the full pipeline (web server + iMessage listener)
npm run dev
```

Open the printed redirect URL **on the iPhone whose number you registered** —
iMessage launches pre-filled with the assigned Photon number. Send any dream
description. The bot will:

1. ack with `🌙 Got it. Painting your dream… <link>`
2. submit to PixVerse and poll
3. send `✨ Your dream is ready: <link>` once the video is up

The link points at `http://localhost:8000/dream/<id>`. To make that link work
on your phone, expose it with ngrok and update `PUBLIC_URL` in `.env`:

```bash
ngrok http 8000
# then in .env: PUBLIC_URL=https://abc123.ngrok-free.app
```

## What still needs to happen on hackathon morning

1. ~~Top up PixVerse credits~~ — done, going through GMI instead
2. ~~Decide who registers their phone~~ — registered: text **+1 415 605 7073** from the iPhone whose number was registered
3. **Start ngrok**, paste the https URL into `PUBLIC_URL=` in `.env`
4. **`npm run dev`** and text a dream from the demo phone

After the loop is alive, layer in HydraDB (resonance/seed dreams) and
GMI (I-Ching divination + structured prompt) per the §4 timetable in
PRODUCT_PLAN.md. The display page already has slots for those — see
`public/dream.html` and the `Dream` interface in `src/store.ts`.

## Files you'll touch later

| When | What | File |
|---|---|---|
| Adding GMI LLM (I-Ching divination + cinematic prompt rewrite) | Replace `dreamPrompt()` with an LLM call (use the same GMI key, different model); populate `structured` and `divination` fields on the Dream object | `src/prompt.ts`, `src/store.ts` |
| Adding HydraDB | Insert each finished dream's embedding; query for resonance | new `src/hydra.ts` |
| Resonance UI | Show 2 similar dreams below the video | `public/dream.html`, `src/server.ts` |
