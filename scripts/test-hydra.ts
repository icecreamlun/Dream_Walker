import {
  ensureNamespace,
  insertDream,
  findResonance,
  deleteDream,
} from "../src/hydra.js";

const TEST_IDS = ["test_alice", "test_bob", "test_self"];

async function cleanup(): Promise<void> {
  for (const id of TEST_IDS) {
    await deleteDream(id);
  }
}

async function main(): Promise<void> {
  await ensureNamespace();
  await cleanup();

  // Insert test dreams
  await insertDream({
    dream_id: "test_alice",
    user_phone: "+15550001111",
    created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    raw_text: "I was flying over a glass ocean",
    summary: "Flying over a crystalline ocean of glass with light shimmering below",
    key_imagery: ["flying", "ocean", "glass"],
    embedding: [],
  });

  await insertDream({
    dream_id: "test_bob",
    user_phone: "+15550002222",
    created_at: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    raw_text: "Underwater breathing test",
    summary: "Breathing underwater in a deep crystalline ocean",
    key_imagery: ["water", "breathing"],
    embedding: [],
  });

  await insertDream({
    dream_id: "test_self",
    user_phone: "+19999999999",
    created_at: new Date().toISOString(),
    raw_text: "self test flying over crystal sea",
    summary: "Flying over a crystal sea, mirroring light",
    key_imagery: ["self", "flying"],
    embedding: [],
  });

  // HydraDB ingestion is async — free plan takes 30-60s
  console.log("waiting 65s for ingestion...");
  await new Promise((r) => setTimeout(r, 65000));

  // Find resonance (text-based query, HydraDB does its own embedding)
  const queryText = "Flying over a crystal sea, mirroring light";
  const matches = await findResonance([], "+19999999999", 2, queryText);
  console.log(`got ${matches.length} matches`);
  for (const m of matches) {
    console.log(
      `  ${m.dream_id}  cosine=${m.cosine.toFixed(3)} final=${m.final_score.toFixed(3)} phone=${m.user_phone_masked}`,
    );
  }

  if (matches.length < 1) throw new Error(`expected >=1 matches, got ${matches.length}`);
  if (matches.some((m) => m.dream_id === "test_self")) {
    throw new Error("self leaked into resonance");
  }
  console.log("✅ HydraDB smoke test passed");

  await cleanup();
}

main().catch(async (e) => {
  console.error("❌", e);
  try { await cleanup(); } catch { /* ignore */ }
  process.exit(1);
});
