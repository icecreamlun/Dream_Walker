import { randomUUID } from "node:crypto";
import { env } from "./env.js";
import { startSpectrum } from "./photon.js";
import { generateVideo } from "./pixverse.js";
import { dreamPrompt } from "./prompt.js";
import { startServer } from "./server.js";
import { saveDream, updateDream, type Dream } from "./store.js";

function dreamUrl(dreamId: string): string {
  return `${env.publicUrl}/dream/${dreamId}`;
}

function shouldIgnore(text: string): boolean {
  const t = text.trim();
  return !t || t.length < 5;
}

// Spectrum gives us [space, message] tuples; types are loose at the boundary.
// We narrow via runtime checks instead of importing the deep generics.
async function handleIncoming(
  space: any,
  message: any,
): Promise<void> {
  if (message.content?.type !== "text") return;
  const text: string = message.content.text ?? "";
  const sender: string = message.sender?.id ?? "+unknown";
  if (message.isFromMe || message.fromMe) return;
  if (shouldIgnore(text)) {
    console.log(`skipping short msg from ${sender}: ${JSON.stringify(text)}`);
    return;
  }

  const dreamId = randomUUID();
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
  console.log(`[${dreamId}] new dream from ${sender}: ${text.slice(0, 60)}…`);

  // 1. Immediate ack
  try {
    await space.send(`🌙 Got it. Painting your dream… ${dreamUrl(dreamId)}`);
  } catch (e) {
    console.error(`[${dreamId}] ack send failed:`, (e as Error).message);
  }

  // 2. Generate
  await updateDream(dreamId, { status: "generating" });
  try {
    const { requestId, url, thumbnail } = await generateVideo(prompt, {
      aspectRatio: "16:9",
      duration: 5,
      quality: "540p",
    });
    await updateDream(dreamId, {
      status: "ready",
      request_id: requestId,
      video_url: url,
      thumbnail_url: thumbnail,
    });
    console.log(`[${dreamId}] ready: ${url}`);
    try {
      await space.send(`✨ Your dream is ready: ${dreamUrl(dreamId)}`);
    } catch (e) {
      console.error(`[${dreamId}] final send failed:`, (e as Error).message);
    }
  } catch (e) {
    const msg = (e as Error).message;
    await updateDream(dreamId, { status: "failed", error: msg });
    console.error(`[${dreamId}] generate failed:`, msg);
    try {
      await space.send(`🌫️ the dream slipped away (${msg.slice(0, 80)}). try again?`);
    } catch {}
  }
}

async function main() {
  await startServer();

  console.log("Starting Photon Spectrum…");
  const app = await startSpectrum();
  console.log("Spectrum app running. Listening for iMessage…");

  for await (const [space, message] of app.messages) {
    handleIncoming(space, message).catch((e) =>
      console.error("handle error:", e),
    );
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
