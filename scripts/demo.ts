// Demo: feed a fake "dream SMS" through the same pipeline as the real bot,
// minus Photon outbound. Useful for showing the flow without an iPhone.
//
//   npm run demo -- "I dreamt I was walking through a forest of stars"
import { randomUUID } from "node:crypto";
import { env } from "../src/env.js";
import { generateVideo } from "../src/pixverse.js";
import { dreamPrompt } from "../src/prompt.js";
import { saveDream, updateDream, type Dream } from "../src/store.js";

const text = process.argv.slice(2).join(" ").trim() ||
  "I am walking through a forest of giant glowing jellyfish floating in midair, their tendrils trailing constellations.";

async function main() {
  const dreamId = randomUUID();
  const sender = "+1demo";
  const prompt = dreamPrompt(text);
  const dream: Dream = {
    dream_id: dreamId,
    user_phone: sender,
    created_at: new Date().toISOString(),
    raw_text: text,
    prompt,
    status: "queued",
  };
  await saveDream(dream);

  const url = `${env.publicUrl}/dream/${dreamId}`;
  console.log("\n🌙 demo dream created");
  console.log("   raw text:", text);
  console.log("   open this in your browser ↓");
  console.log("   " + url + "\n");

  console.log("[ack] sent (mocked)");

  await updateDream(dreamId, { status: "generating" });
  console.log("[gmi] submitting…");

  try {
    const { requestId, url: videoUrl, thumbnail } = await generateVideo(prompt, {
      aspectRatio: "16:9",
      duration: 5,
      quality: "540p",
    });
    await updateDream(dreamId, {
      status: "ready",
      request_id: requestId,
      video_url: videoUrl,
      thumbnail_url: thumbnail,
    });
    console.log("\n✨ ready");
    console.log("   page:     ", url);
    console.log("   video:    ", videoUrl);
    if (thumbnail) console.log("   thumbnail:", thumbnail);
  } catch (e) {
    const msg = (e as Error).message;
    await updateDream(dreamId, { status: "failed", error: msg });
    console.error("FAILED:", msg);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
