// Smoke test: verify resonance returns soulmate_1 as top-1 and soulmate_2 as top-2.
// Per design doc §8.2 + §15. This is the demo's life-or-death test.

import { findResonance } from "../src/hydra.js";
import { embed, buildEmbeddingInput } from "../src/embedding.js";

const DEMO_TEXT =
  "I dreamt I was by a river. Someone in white was calling me from the other side, but I couldn't cross.";

const DEMO_SUMMARY =
  "Standing by a river, someone in white calling from the far side, unable to cross";
const DEMO_KEY_IMAGERY = ["river", "water", "calling", "separation", "white", "crossing"];

const EXPECTED_TOP_1 = "soulmate_1";
const EXPECTED_TOP_2 = "soulmate_2";

async function main(): Promise<void> {
  console.log("Resonance smoke test");
  console.log(`Demo dream: "${DEMO_TEXT}"\n`);

  const embInput = buildEmbeddingInput(DEMO_SUMMARY, DEMO_KEY_IMAGERY);
  console.log(`Embedding input: "${embInput}"`);

  let vec: number[];
  try {
    vec = await embed(embInput);
    console.log(`Embedding: ${vec.length}-d vector (first 5: [${vec.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}])\n`);
  } catch (e) {
    console.error("❌ Embedding failed:", (e as Error).message);
    console.error("   Is OPENAI_API_KEY set in .env?");
    process.exit(1);
  }

  const matches = await findResonance(vec, "+1demo_user", 2, embInput);

  if (matches.length < 2) {
    console.error(`❌ Expected 2 matches, got ${matches.length}`);
    console.error("   Has seed.ts been run? Is HydraDB ingestion complete (~30s after seed)?");
    process.exit(1);
  }

  console.log("Results:");
  for (const m of matches) {
    console.log(
      `  ${m.dream_id}  cosine=${m.cosine.toFixed(3)}  final=${m.final_score.toFixed(3)}  phone=${m.user_phone_masked}  "${m.summary.slice(0, 60)}"`,
    );
  }
  console.log();

  const top1 = matches[0].dream_id;
  const top2 = matches[1].dream_id;

  if (top1 !== EXPECTED_TOP_1) {
    console.error(`❌ top-1 is "${top1}", expected "${EXPECTED_TOP_1}"`);
    console.error("   Fix: tighten soulmate_1 text or loosen distractor key_imagery");
    process.exit(1);
  }

  if (top2 !== EXPECTED_TOP_2) {
    console.warn(`⚠️  top-2 is "${top2}", expected "${EXPECTED_TOP_2}" (non-fatal but check)`);
  }

  console.log("✅ Resonance smoke test passed");
  console.log(`   top-1: ${top1} (cosine=${matches[0].cosine.toFixed(3)})`);
  console.log(`   top-2: ${top2} (cosine=${matches[1].cosine.toFixed(3)})`);
}

main().catch((e) => {
  console.error("❌ Verify failed:", e);
  process.exit(1);
});
