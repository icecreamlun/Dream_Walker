import { env } from "./env.js";

// ── Types ──────────────────────────────────────────────

export interface Structured {
  title: string;
  summary: string; // forced English
  characters: string[];
  scenes: string[];
  emotions: string[];
  key_imagery: string[]; // forced English keywords
}

export interface VisualBrief {
  color_palette: string;
  camera_movement: string;
  lighting: string;
  mood_board_tags: string[];
}

export interface Divination {
  gua_name: string; // e.g. "未济"
  gua_meaning: string; // e.g. "Wei Ji — things unfinished"
  interpretation: string;
  visual_brief: VisualBrief;
}

export interface ConversationAction {
  action: "ask" | "process";
  message: string;
  reasoning: string;
}

// ── Prompt Templates ───────────────────────────────────

const EXTRACT_PROMPT = `You are a dream interpreter's assistant. Given the user's dream description(s), extract structured information.

CRITICAL: The "summary" and "key_imagery" fields MUST be in English regardless of input language. Translate if needed.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "title": "short evocative title (user's language OK)",
  "summary": "1-2 sentence English summary of the dream",
  "characters": ["list of characters/entities"],
  "scenes": ["list of distinct scenes/locations"],
  "emotions": ["list of emotions felt"],
  "key_imagery": ["English keywords for key visual symbols, 4-8 items"]
}`;

const DIVINE_PROMPT = `You are a Zhou Yi (周易 / I Ching) divination master. Given a structured dream analysis, select the most fitting hexagram and provide interpretation.

Return ONLY valid JSON (no markdown fences):
{
  "gua_name": "Chinese name of the hexagram (e.g. 未济)",
  "gua_meaning": "English translation (e.g. Wei Ji — things unfinished)",
  "interpretation": "2-3 sentence poetic interpretation connecting the dream to the hexagram. Mix Chinese philosophy with accessible language.",
  "visual_brief": {
    "color_palette": "3-4 colors (e.g. deep indigo, moonlit silver, misty white)",
    "camera_movement": "camera direction (e.g. slow dolly forward, static wide shot)",
    "lighting": "lighting style (e.g. volumetric moonlight, golden hour haze)",
    "mood_board_tags": ["3-5 mood tags"]
  }
}`;

const CINEMATIC_PROMPT = `You are a cinematic prompt writer for an AI video generator. Given a dream's structured analysis and I Ching divination, write a single paragraph prompt for generating a 5-second dreamlike video.

Rules:
- Under 200 words
- No text/watermark/UI instructions
- Include: visual style, camera movement, lighting, key imagery
- Tone: surreal, ethereal, introspective
- Draw from the visual_brief fields

Return ONLY the prompt text as a plain string (no JSON, no quotes, no markdown).`;

const STATE_MACHINE_PROMPT = `You are a dream agent. The user just texted you about a dream. Decide whether to ask a clarifying question or process the dream.

Rules:
1. If this is the first message AND it's under 100 characters → ask ONE short question (under 15 words) to draw out more detail. Question must be dream-themed and probe ONE element.
2. If this is the first message AND it's 100+ characters → process immediately.
3. If this is turn 3 or later → ALWAYS process (forced).
4. Your question should feel natural, like a curious friend, not clinical.

Return ONLY valid JSON:
{"action": "ask" | "process", "message": "your question or acknowledgment", "reasoning": "why"}`;

// ── GMI LLM Client ─────────────────────────────────────

function getLlmConfig(): { baseUrl: string; model: string } | null {
  if (!env.gmiLlmBaseUrl || !env.gmiLlmModel) return null;
  return { baseUrl: env.gmiLlmBaseUrl.replace(/\/$/, ""), model: env.gmiLlmModel };
}

async function chatCompletion(
  system: string,
  userContent: string,
  jsonMode: boolean = true,
): Promise<string> {
  const cfg = getLlmConfig();
  if (!cfg) throw new Error("GMI LLM not configured (GMI_LLM_BASE_URL / GMI_LLM_MODEL empty)");

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    temperature: 0.7,
    max_tokens: 1024,
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.gmiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`GMI LLM failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

function cleanJson(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  return s.trim();
}

// ── Public API ─────────────────────────────────────────

export async function extractStructured(dreamTexts: string[]): Promise<Structured> {
  const joined = dreamTexts.join("\n\n");
  const raw = await chatCompletion(EXTRACT_PROMPT, joined);
  const parsed = JSON.parse(cleanJson(raw));
  return {
    title: parsed.title ?? "Untitled Dream",
    summary: parsed.summary ?? joined.slice(0, 200),
    characters: parsed.characters ?? [],
    scenes: parsed.scenes ?? [],
    emotions: parsed.emotions ?? [],
    key_imagery: parsed.key_imagery ?? [],
  };
}

export async function divine(structured: Structured): Promise<Divination> {
  const raw = await chatCompletion(DIVINE_PROMPT, JSON.stringify(structured));
  const parsed = JSON.parse(cleanJson(raw));
  return {
    gua_name: parsed.gua_name ?? "乾",
    gua_meaning: parsed.gua_meaning ?? "Qian — the Creative",
    interpretation: parsed.interpretation ?? "",
    visual_brief: {
      color_palette: parsed.visual_brief?.color_palette ?? "",
      camera_movement: parsed.visual_brief?.camera_movement ?? "",
      lighting: parsed.visual_brief?.lighting ?? "",
      mood_board_tags: parsed.visual_brief?.mood_board_tags ?? [],
    },
  };
}

export async function cinematicPrompt(
  structured: Structured,
  divination: Divination,
): Promise<string> {
  const input = JSON.stringify({ structured, divination });
  const raw = await chatCompletion(CINEMATIC_PROMPT, input, false);
  return raw.trim().replace(/^["']|["']$/g, "");
}

export async function handleConversation(
  messages: { role: "user" | "assistant"; content: string }[],
  turnCount: number,
): Promise<ConversationAction> {
  if (turnCount >= 3) {
    return {
      action: "process",
      message: "Got it. Hold on—I'll dream-read this for you",
      reasoning: "Turn cap reached (3)",
    };
  }
  const context = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const userInput = `Turn: ${turnCount + 1}\nConversation so far:\n${context}`;

  let raw: string;
  try {
    raw = await chatCompletion(STATE_MACHINE_PROMPT, userInput);
  } catch (e) {
    console.warn("[llm] state machine call failed, force-processing:", (e as Error).message);
    return {
      action: "process",
      message: "Got it. Hold on—I'll dream-read this for you",
      reasoning: "LLM call failed, force-process",
    };
  }

  try {
    const parsed = JSON.parse(cleanJson(raw));
    return {
      action: parsed.action === "ask" ? "ask" : "process",
      message: parsed.message ?? "Tell me more about your dream?",
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    // Retry once
    try {
      const retry = await chatCompletion(STATE_MACHINE_PROMPT, userInput);
      const parsed = JSON.parse(cleanJson(retry));
      return {
        action: parsed.action === "ask" ? "ask" : "process",
        message: parsed.message ?? "Tell me more about your dream?",
        reasoning: parsed.reasoning ?? "",
      };
    } catch {
      return {
        action: "process",
        message: "Got it. Hold on—I'll dream-read this for you",
        reasoning: "JSON parse failed twice, force-process",
      };
    }
  }
}

export function isLlmConfigured(): boolean {
  return getLlmConfig() !== null;
}

export async function warmup(): Promise<void> {
  const cfg = getLlmConfig();
  if (!cfg) {
    console.log("[llm] GMI LLM not configured — skipping warmup");
    return;
  }
  try {
    await chatCompletion(
      "You are a test. Reply with exactly: {\"ok\": true}",
      "ping",
    );
    console.log("[llm] warmup ok");
  } catch (e) {
    console.warn("[llm] warmup failed:", (e as Error).message);
  }
}
