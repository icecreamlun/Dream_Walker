import { randomUUID } from "node:crypto";
import { env } from "./env.js";
import { startSpectrum } from "./photon.js";
import { generateVideo } from "./pixverse.js";
import { dreamPrompt } from "./prompt.js";
import { startServer } from "./server.js";
import { saveDream, updateDream, type Dream } from "./store.js";
import {
  extractStructured,
  divine,
  cinematicPrompt,
  handleConversation,
  isLlmConfigured,
  warmup as llmWarmup,
} from "./llm.js";
import { embed, buildEmbeddingInput } from "./embedding.js";
import {
  ensureNamespace,
  insertDream,
  findResonance,
  type HydraDreamRecord,
} from "./hydra.js";

function dreamUrl(dreamId: string): string {
  return `${env.publicUrl}/dream/${dreamId}`;
}

function shouldIgnore(text: string): boolean {
  const t = text.trim();
  return !t;
}

// ── Conversation sessions (in-memory, 5min timeout) ────

interface Session {
  messages: { role: "user" | "assistant"; content: string }[];
  lastSeen: number;
}

const sessions = new Map<string, Session>();

function getSession(phone: string): Session {
  const now = Date.now();
  let s = sessions.get(phone);
  if (!s || now - s.lastSeen > 5 * 60 * 1000) {
    s = { messages: [], lastSeen: now };
    sessions.set(phone, s);
  }
  s.lastSeen = now;
  return s;
}

function clearSession(phone: string): void {
  sessions.delete(phone);
}

// ── Full pipeline (runs async after ack) ───────────────

async function processDream(
  space: any,
  sender: string,
  dreamTexts: string[],
): Promise<void> {
  const dreamId = randomUUID();
  const rawText = dreamTexts.join("\n\n");
  const dream: Dream = {
    dream_id: dreamId,
    user_phone: sender,
    created_at: new Date().toISOString(),
    raw_text: rawText,
    prompt: "",
    status: "queued",
  };
  await saveDream(dream);
  console.log(`[${dreamId}] pipeline start for ${sender}`);

  try {
    try {
      await space.send(`🌙 Got it. Painting your dream… ${dreamUrl(dreamId)}`);
    } catch (e) {
      console.error(`[${dreamId}] ack send failed:`, (e as Error).message);
    }
    await updateDream(dreamId, { status: "generating" });

    let structured;
    let divination;
    let prompt: string;

    if (isLlmConfigured()) {
      console.log(`[${dreamId}] LLM extract...`);
      structured = await extractStructured(dreamTexts);
      console.log(`[${dreamId}] LLM divine...`);
      divination = await divine(structured);
      console.log(`[${dreamId}] LLM cinematic prompt...`);
      prompt = await cinematicPrompt(structured, divination);
    } else {
      console.log(`[${dreamId}] LLM not configured, using basic prompt`);
      prompt = dreamPrompt(rawText);
    }

    await updateDream(dreamId, { prompt, structured, divination });

    const embeddingInput = structured
      ? buildEmbeddingInput(structured.summary, structured.key_imagery)
      : rawText;

    const [videoResult, embeddingResult] = await Promise.allSettled([
      generateVideo(prompt, { aspectRatio: "16:9", duration: 5, quality: "540p" }),
      embed(embeddingInput),
    ]);

    let videoUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    let requestId: string | undefined;
    if (videoResult.status === "fulfilled") {
      videoUrl = videoResult.value.url;
      thumbnailUrl = videoResult.value.thumbnail;
      requestId = videoResult.value.requestId;
    } else {
      console.error(`[${dreamId}] video failed:`, videoResult.reason);
    }

    let embeddingVec: number[] | undefined;
    if (embeddingResult.status === "fulfilled") {
      embeddingVec = embeddingResult.value;
    } else {
      console.warn(`[${dreamId}] embedding failed, using zero vec:`, embeddingResult.reason);
      embeddingVec = new Array(1536).fill(0);
    }

    if (structured && env.hydraApiKey) {
      try {
        const record: HydraDreamRecord = {
          dream_id: dreamId,
          user_phone: sender,
          created_at: dream.created_at,
          raw_text: rawText,
          summary: structured.summary,
          key_imagery: structured.key_imagery,
          video_url: videoUrl,
          embedding: embeddingVec ?? [],
        };
        await insertDream(record);
        console.log(`[${dreamId}] HydraDB insert ok`);
      } catch (e) {
        console.warn(`[${dreamId}] HydraDB insert failed:`, (e as Error).message);
      }
    }

    let resonance: Dream["resonance"];
    if (structured && env.hydraApiKey) {
      try {
        const matches = await findResonance(
          embeddingVec ?? [],
          sender,
          2,
          embeddingInput,
        );
        resonance = matches.map((m) => ({
          dream_id: m.dream_id,
          user_phone_masked: m.user_phone_masked,
          summary: m.summary,
          score: m.final_score,
        }));
        console.log(`[${dreamId}] resonance: ${resonance.length} match(es)`);
      } catch (e) {
        console.warn(`[${dreamId}] resonance failed:`, (e as Error).message);
      }
    }

    await updateDream(dreamId, {
      status: videoUrl ? "ready" : "failed",
      request_id: requestId,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      embedding: embeddingVec,
      resonance,
      error: videoUrl ? undefined : "Video generation failed",
    });

    try {
      if (videoUrl) {
        await space.send(`✨ Your dream is ready: ${dreamUrl(dreamId)}`);
      } else {
        await space.send(`🌫️ The dream slipped away. Try again?`);
      }
    } catch (e) {
      console.error(`[${dreamId}] final send failed:`, (e as Error).message);
    }
  } catch (e) {
    const msg = (e as Error).message;
    await updateDream(dreamId, { status: "failed", error: msg });
    console.error(`[${dreamId}] pipeline failed:`, msg);
    try {
      await space.send(`🌫️ the dream slipped away (${msg.slice(0, 80)}). try again?`);
    } catch {}
  }
}

// ── Incoming message handler ───────────────────────────

async function handleIncoming(space: any, message: any): Promise<void> {
  if (message.content?.type !== "text") return;
  const text: string = message.content.text ?? "";
  const sender: string = message.sender?.id ?? "+unknown";
  if (message.isFromMe || message.fromMe) return;
  if (shouldIgnore(text)) {
    console.log(`skipping short msg from ${sender}: ${JSON.stringify(text)}`);
    return;
  }

  if (isLlmConfigured()) {
    const session = getSession(sender);
    session.messages.push({ role: "user", content: text });
    const turnCount = Math.ceil(session.messages.filter((m) => m.role === "user").length);

    const decision = await handleConversation(session.messages, turnCount);
    console.log(`[conv] ${sender} turn=${turnCount} action=${decision.action}: ${decision.reasoning}`);

    if (decision.action === "ask") {
      session.messages.push({ role: "assistant", content: decision.message });
      try {
        await space.send(decision.message);
      } catch (e) {
        console.error(`[conv] send failed:`, (e as Error).message);
      }
      return;
    }

    const dreamTexts = session.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content);
    clearSession(sender);
    processDream(space, sender, dreamTexts).catch((e) =>
      console.error("pipeline error:", e),
    );
  } else {
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
    console.log(`[${dreamId}] new dream from ${sender} (no LLM mode)`);

    try {
      await space.send(`🌙 Got it. Painting your dream… ${dreamUrl(dreamId)}`);
    } catch (e) {
      console.error(`[${dreamId}] ack send failed:`, (e as Error).message);
    }

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
}

// ── Main ───────────────────────────────────────────────

async function main() {
  console.log("Warming up...");
  await llmWarmup();

  if (env.hydraApiKey) {
    try {
      await ensureNamespace();
    } catch (e) {
      console.warn("HydraDB namespace setup failed:", (e as Error).message);
    }
  }

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
