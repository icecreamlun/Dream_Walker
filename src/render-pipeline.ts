// Shared dream-rendering pipeline used by both the iMessage handler
// (src/index.ts) and the web /chat endpoint (src/server.ts).
//
// The pipeline:
//   1. save Dream record (status=queued) so the page resolves immediately
//   2. ack via notify() if provided
//   3. extract structured fields → divine hexagram → cinematic prompt (LLM)
//   4. generateVideo + embed in parallel; on PixVerse moderation block,
//      sanitize the prompt via LLM and retry once
//   5. insert into HydraDB; query resonance
//   6. update Dream record with the final state
//   7. notify() with the dream URL or a soft failure message
//
// renderDream() returns the dreamId synchronously (before the pipeline finishes)
// so the caller can immediately reply with the link. The page itself
// auto-refreshes every 5s until status === "ready".
import { randomUUID } from "node:crypto";
import { embed, buildEmbeddingInput } from "./embedding.js";
import { env } from "./env.js";
import { findResonance, insertDream, type HydraDreamRecord } from "./hydra.js";
import {
  cinematicPrompt,
  divine,
  extractStructured,
  isLlmConfigured,
  sanitizeForVideo,
} from "./llm.js";
import { generateVideo } from "./pixverse.js";
import { dreamPrompt } from "./prompt.js";
import { saveDream, updateDream, type Dream } from "./store.js";

const MODERATION_PATTERN = /sensitive information|content polic|moderation/i;

const VIDEO_OPTS = {
  aspectRatio: "16:9" as const,
  duration: 5 as const,
  quality: "540p" as const,
};

export interface RenderOptions {
  sender: string;
  rawText: string | string[];
  /** Called with progress messages (typically only set for SMS). */
  notify?: (message: string) => Promise<void>;
}

function dreamUrl(dreamId: string): string {
  return `${env.publicUrl}/dream/${dreamId}`;
}

async function tryNotify(
  notify: ((m: string) => Promise<void>) | undefined,
  message: string,
): Promise<void> {
  if (!notify) return;
  try {
    await notify(message);
  } catch (e) {
    console.error(`notify failed:`, (e as Error).message);
  }
}

async function generateVideoWithSanitizeRetry(
  prompt: string,
  dreamId: string,
): Promise<{ requestId: string; url: string; thumbnail?: string }> {
  try {
    return await generateVideo(prompt, VIDEO_OPTS);
  } catch (e) {
    const msg = (e as Error).message;
    if (!MODERATION_PATTERN.test(msg) || !isLlmConfigured()) throw e;
    console.log(`[${dreamId}] moderation flag — sanitizing prompt and retrying`);
    const safe = await sanitizeForVideo(prompt);
    await updateDream(dreamId, { prompt: safe });
    console.log(`[${dreamId}] retrying with sanitized prompt`);
    return await generateVideo(safe, VIDEO_OPTS);
  }
}

async function runPipeline(dreamId: string, opts: RenderOptions): Promise<void> {
  const dreamTexts = Array.isArray(opts.rawText) ? opts.rawText : [opts.rawText];
  const rawText = dreamTexts.join("\n\n");
  const startedAt = new Date().toISOString();

  try {
    await tryNotify(opts.notify, `🌙 Got it. Painting your dream… ${dreamUrl(dreamId)}`);
    await updateDream(dreamId, { status: "generating" });

    // Stage 1: LLM understanding
    let structured;
    let divination;
    let prompt: string;

    if (isLlmConfigured()) {
      console.log(`[${dreamId}] LLM extract…`);
      structured = await extractStructured(dreamTexts);
      console.log(`[${dreamId}] LLM divine…`);
      divination = await divine(structured);
      console.log(`[${dreamId}] LLM cinematic…`);
      prompt = await cinematicPrompt(structured, divination);
    } else {
      prompt = dreamPrompt(rawText);
    }
    await updateDream(dreamId, { prompt, structured, divination });

    // Stage 2: video + embedding in parallel; video has moderation auto-retry
    const embeddingInput = structured
      ? buildEmbeddingInput(structured.summary, structured.key_imagery)
      : rawText;

    const [videoResult, embeddingResult] = await Promise.allSettled([
      generateVideoWithSanitizeRetry(prompt, dreamId),
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
      console.error(`[${dreamId}] video failed:`, (videoResult.reason as Error).message);
    }

    let embeddingVec: number[] | undefined;
    if (embeddingResult.status === "fulfilled") {
      embeddingVec = embeddingResult.value;
    } else {
      console.warn(`[${dreamId}] embedding failed, using zero vec:`, embeddingResult.reason);
      embeddingVec = new Array(1536).fill(0);
    }

    // Stage 3: HydraDB insert + resonance lookup
    if (structured && env.hydraApiKey) {
      try {
        const record: HydraDreamRecord = {
          dream_id: dreamId,
          user_phone: opts.sender,
          created_at: startedAt,
          raw_text: rawText,
          summary: structured.summary,
          key_imagery: structured.key_imagery,
          video_url: videoUrl,
          embedding: embeddingVec ?? [],
        };
        await insertDream(record);
      } catch (e) {
        console.warn(`[${dreamId}] hydra insert failed:`, (e as Error).message);
      }
    }

    let resonance: Dream["resonance"];
    if (structured && env.hydraApiKey) {
      try {
        const matches = await findResonance(
          embeddingVec ?? [],
          opts.sender,
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

    // Stage 4: persist final state
    await updateDream(dreamId, {
      status: videoUrl ? "ready" : "failed",
      request_id: requestId,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      embedding: embeddingVec,
      resonance,
      error: videoUrl ? undefined : "video generation failed",
    });

    if (videoUrl) {
      await tryNotify(opts.notify, `✨ Your dream is ready: ${dreamUrl(dreamId)}`);
    } else {
      await tryNotify(opts.notify, `🌫️ The dream slipped away. Try again?`);
    }
  } catch (e) {
    const msg = (e as Error).message;
    await updateDream(dreamId, { status: "failed", error: msg });
    console.error(`[${dreamId}] pipeline failed:`, msg);
    await tryNotify(opts.notify, `🌫️ the dream slipped away (${msg.slice(0, 80)}). try again?`);
  }
}

/**
 * Kick off the dream-rendering pipeline. Returns the dreamId immediately —
 * the rest runs in the background, calling `notify` if provided.
 */
export async function renderDream(opts: RenderOptions): Promise<string> {
  const dreamId = randomUUID();
  const dreamTexts = Array.isArray(opts.rawText) ? opts.rawText : [opts.rawText];
  const rawText = dreamTexts.join("\n\n");

  const dream: Dream = {
    dream_id: dreamId,
    user_phone: opts.sender,
    created_at: new Date().toISOString(),
    raw_text: rawText,
    prompt: "",
    status: "queued",
  };
  await saveDream(dream);
  console.log(`[${dreamId}] queued for ${opts.sender}`);

  // Background — we want the caller to use the dreamId immediately.
  runPipeline(dreamId, opts).catch((e) =>
    console.error(`[${dreamId}] runPipeline crashed:`, e),
  );

  return dreamId;
}
