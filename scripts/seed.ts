// Seed 10 dreams into HydraDB for demo resonance.
// soulmate_1 (top-1) and soulmate_2 (top-2) texts are locked per design doc §8.1.
// Distractors must NOT contain "river", "calling", "separation" to avoid crowding soulmate_1.

import { ensureNamespace, insertDream, type HydraDreamRecord } from "../src/hydra.js";
import { embed, buildEmbeddingInput } from "../src/embedding.js";

interface SeedDream {
  id: string;
  phone: string;
  raw_text: string;
  summary: string;
  key_imagery: string[];
  emotions: string[];
  gua_name: string;
  gua_meaning: string;
  hoursAgo: number; // relative to now
}

const SEEDS: SeedDream[] = [
  // ── Soulmate 1 (top-1 match) — 4 keywords overlap with demo dream ──
  {
    id: "soulmate_1",
    phone: "+15550000001",
    raw_text: "I was on the wrong side of a wide river. Heard my name. Couldn't reach.",
    summary: "Standing at riverbank, hearing someone call from the far side, unable to cross",
    key_imagery: ["river", "water", "calling", "separation", "reaching", "name"],
    emotions: ["longing", "helpless"],
    gua_name: "未济",
    gua_meaning: "Wei Ji — things unfinished",
    hoursAgo: 6,
  },
  // ── Soulmate 2 (top-2 match) — 1 keyword overlap (water) ──
  {
    id: "soulmate_2",
    phone: "+15550000007",
    raw_text: "I was underwater but I could breathe. Someone was floating above me, watching.",
    summary: "Breathing underwater, watching a figure float silently above the surface",
    key_imagery: ["water", "breathing", "floating", "watching", "immersion"],
    emotions: ["calm", "mystery"],
    gua_name: "坎",
    gua_meaning: "Kan — water, the abysmal",
    hoursAgo: 14,
  },
  // ── Distractors (8 dreams, no "river"/"calling"/"separation") ──
  {
    id: "seed_3",
    phone: "+15550000002",
    raw_text: "I was in an enormous library where the books kept rearranging themselves.",
    summary: "Wandering an infinite library where books shift and rearrange on their own",
    key_imagery: ["library", "books", "maze", "shifting", "knowledge"],
    emotions: ["wonder", "confusion"],
    gua_name: "艮",
    gua_meaning: "Gen — keeping still, mountain",
    hoursAgo: 3,
  },
  {
    id: "seed_4",
    phone: "+15550000003",
    raw_text: "I was walking through a field of mirrors. Each one showed a different version of me.",
    summary: "Walking through a mirror field where each reflection shows a different self",
    key_imagery: ["mirrors", "field", "reflection", "identity", "light"],
    emotions: ["curiosity", "unease"],
    gua_name: "离",
    gua_meaning: "Li — the clinging, fire",
    hoursAgo: 8,
  },
  {
    id: "seed_5",
    phone: "+15550000004",
    raw_text: "A giant tree was growing out of my childhood home. Its roots went through the floor.",
    summary: "A massive tree growing through childhood home, roots cracking the foundation",
    key_imagery: ["tree", "home", "roots", "growth", "foundation"],
    emotions: ["nostalgia", "awe"],
    gua_name: "渐",
    gua_meaning: "Jian — development, gradual progress",
    hoursAgo: 10,
  },
  {
    id: "seed_6",
    phone: "+15550000005",
    raw_text: "I was on a train that never stopped. The landscape outside kept changing seasons.",
    summary: "Riding an endless train through landscapes cycling through all four seasons",
    key_imagery: ["train", "seasons", "movement", "landscape", "time"],
    emotions: ["melancholy", "peace"],
    gua_name: "旅",
    gua_meaning: "Lu — the wanderer",
    hoursAgo: 18,
  },
  {
    id: "seed_7",
    phone: "+15550000006",
    raw_text: "Birds made of paper were flying around my room. They sang real songs.",
    summary: "Paper birds flying through a room singing real melodies",
    key_imagery: ["birds", "paper", "music", "room", "flight"],
    emotions: ["delight", "surreal"],
    gua_name: "巽",
    gua_meaning: "Xun — the gentle, wind",
    hoursAgo: 4,
  },
  {
    id: "seed_8",
    phone: "+15550000008",
    raw_text: "The moon fell into a lake. I dove in to get it but it kept sinking.",
    summary: "Diving into a lake to retrieve a fallen moon that keeps sinking deeper",
    key_imagery: ["moon", "lake", "diving", "sinking", "water"],
    emotions: ["determination", "futility"],
    gua_name: "蒙",
    gua_meaning: "Meng — youthful folly",
    hoursAgo: 72, // 3 days — in 7d fallback pool
  },
  {
    id: "seed_9",
    phone: "+15550000009",
    raw_text: "I was eating dinner with people whose faces kept changing.",
    summary: "Sharing a meal with companions whose faces shift into strangers mid-conversation",
    key_imagery: ["dinner", "faces", "strangers", "table", "shifting"],
    emotions: ["anxiety", "disconnect"],
    gua_name: "睽",
    gua_meaning: "Kui — opposition",
    hoursAgo: 120, // 5 days — in 7d fallback pool
  },
  {
    id: "seed_10",
    phone: "+15550000010",
    raw_text: "I climbed a staircase that spiraled into clouds. Each step played a note.",
    summary: "Climbing a spiral staircase into clouds where each step plays a musical note",
    key_imagery: ["staircase", "clouds", "music", "climbing", "spiral"],
    emotions: ["elation", "wonder"],
    gua_name: "升",
    gua_meaning: "Sheng — pushing upward",
    hoursAgo: 2,
  },
];

async function main(): Promise<void> {
  console.log("Seeding 10 dreams into HydraDB...\n");
  await ensureNamespace();

  const now = Date.now();

  for (const s of SEEDS) {
    const embInput = buildEmbeddingInput(s.summary, s.key_imagery);
    console.log(`[seed] ${s.id}: embedding "${embInput.slice(0, 60)}..."`);

    let embVec: number[];
    try {
      embVec = await embed(embInput);
    } catch (e) {
      console.warn(`[seed] ${s.id}: embedding failed, using zero vec:`, (e as Error).message);
      embVec = new Array(1536).fill(0);
    }

    const record: HydraDreamRecord = {
      dream_id: s.id,
      user_phone: s.phone,
      created_at: new Date(now - s.hoursAgo * 3600 * 1000).toISOString(),
      raw_text: s.raw_text,
      summary: s.summary,
      key_imagery: s.key_imagery,
      embedding: embVec,
    };

    try {
      await insertDream(record);
      console.log(`  ✓ ${s.id} inserted`);
    } catch (e) {
      console.error(`  ✗ ${s.id} failed:`, (e as Error).message);
    }
  }

  console.log("\n✅ Seeding complete (10 dreams)");
  console.log("Wait ~30s for HydraDB ingestion, then run: npm run verify-resonance");
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
