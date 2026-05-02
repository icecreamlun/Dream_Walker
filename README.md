# Dream Walker 🌙🍵

Hackathon project — Build Matcha & Code · 2026-05-02

User texts a dream → PixVerse turns it into a video → HydraDB remembers it → GMI interprets recurring patterns → Photon sends it back via iMessage.

**Read [PRODUCT_PLAN.md](./PRODUCT_PLAN.md) first.** It has the architecture, division of labor, and 5-hour timeline.

## Quickstart

```bash
cp .env.example .env          # fill in keys after morning workshops
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000

# in another shell, expose for Photon webhook
ngrok http 8000
```

## Layout

```
backend/    Person A — Photon webhook, PixVerse, GMI orchestration
memory/     Person B — HydraDB client, pattern aggregation
dashboard/  Person B — React/Vite gallery + word cloud + emotion chart
shared/     Shared schema and clients (gmi_client, types)
```

## Demo backup

`memory/seed.py` pre-loads ~8 dreams with pre-generated PixVerse videos so the dashboard demos even with no network.
