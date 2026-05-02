// Text-to-video via GMI Cloud (model = pixverse-v5.6-t2v).
// One call satisfies both the GMI and PixVerse sponsor tracks.
import { env } from "./env.js";

const BASE = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests";

export interface GenerateOptions {
  aspectRatio?: "16:9" | "9:16" | "1:1";
  duration?: 5 | 8;
  quality?: "360p" | "540p" | "720p" | "1080p";
  style?: "none" | "anime" | "3d_animation";
  negativePrompt?: string;
  generateAudio?: boolean;
}

interface SubmitResponse {
  request_id: string;
  status: string;
  model: string;
}

interface PollResponse {
  request_id: string;
  status: "dispatched" | "processing" | "success" | "failed" | string;
  outcome: null | {
    media_urls?: { id: string; url: string }[];
    thumbnail_image_url?: string;
  };
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.gmiApiKey}`,
    "Content-Type": "application/json",
  };
}

export async function submitTextToVideo(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const body = {
    model: env.gmiT2vModel,
    payload: {
      prompt,
      negative_prompt: opts.negativePrompt ?? "blurry, low quality, distorted, text, watermark",
      duration: String(opts.duration ?? 5),
      aspect_ratio: opts.aspectRatio ?? "16:9",
      quality: opts.quality ?? "540p",
      style: opts.style ?? "none",
      thinking_type: "auto",
      generate_audio_switch: opts.generateAudio ?? false,
      generate_multi_clip_switch: false,
    },
  };
  const res = await fetch(BASE, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`GMI submit failed: ${res.status} ${res.statusText} — ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as SubmitResponse;
  if (!data.request_id) throw new Error(`GMI submit: missing request_id (${JSON.stringify(data)})`);
  return data.request_id;
}

export async function getResult(requestId: string): Promise<PollResponse> {
  const res = await fetch(`${BASE}/${requestId}`, { headers: headers() });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`GMI poll failed: ${res.status} — ${t.slice(0, 200)}`);
  }
  return (await res.json()) as PollResponse;
}

export async function pollUntilReady(
  requestId: string,
  opts: { intervalMs?: number; timeoutMs?: number; onTick?: (status: string) => void } = {},
): Promise<{ url: string; thumbnail?: string }> {
  const interval = opts.intervalMs ?? 3000;
  const timeout = opts.timeoutMs ?? 5 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const r = await getResult(requestId);
    opts.onTick?.(r.status);
    if (r.status === "success") {
      const url = r.outcome?.media_urls?.[0]?.url;
      if (!url) throw new Error("GMI: success but no media_urls");
      return { url, thumbnail: r.outcome?.thumbnail_image_url };
    }
    if (r.status === "failed") {
      throw new Error(`GMI: generation failed (request_id=${requestId})`);
    }
    await new Promise((res) => setTimeout(res, interval));
  }
  throw new Error(`GMI: timed out after ${timeout}ms (request_id=${requestId})`);
}

export async function generateVideo(prompt: string, opts: GenerateOptions = {}): Promise<{
  requestId: string;
  url: string;
  thumbnail?: string;
}> {
  const requestId = await submitTextToVideo(prompt, opts);
  const { url, thumbnail } = await pollUntilReady(requestId, {
    onTick: (s) => console.log(`[gmi ${requestId.slice(0, 8)}] status=${s}`),
  });
  return { requestId, url, thumbnail };
}
