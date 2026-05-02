// GMI chat completions wrapper for the dream-mystic agent.
// One call returns: a chat reply, plus a structured "intent" tag the orchestrator uses
// to decide whether to spin up a PixVerse video for the user's turn.
import { env } from "./env.js";
import { type ChatMessage } from "./conversation.js";
import { listDreams, type Dream } from "./store.js";

const SYSTEM = `You are Dream Walker — a warm, curious dream companion. You speak like an old friend who knows the I Ching, Jung, and a little Daoism, but never lectures. You write in English. You use plain prose with occasional Chinese hexagram references when they truly fit. Keep replies short for SMS (2–4 sentences typical). Never diagnose, never moralize. End with a gentle question only when it fits.

You can act on the user's behalf:
- When the user describes a fresh dream they had, you ALSO want a cinematic video generated of it. Mark "intent": "new_dream" so the system knows to start the video render. Reply briefly while it cooks ("painting it now…").
- When the user asks a follow-up about a previous dream, recurring symbols, or their archive, mark "intent": "chat".
- When the message is small talk / greetings / unclear, mark "intent": "chat".

You will be given the user's recent dream archive as context. Reference specific dreams when it helps ("the river dream from yesterday", "your second dream of water this week").

Output ONLY a JSON object, no markdown, no preamble:
{
  "intent": "new_dream" | "chat",
  "reply": "your message to the user — 2 to 4 sentences"
}`;

interface ChatResult {
  intent: "new_dream" | "chat";
  reply: string;
}

function dreamArchiveBlock(dreams: Dream[]): string {
  const recent = dreams.slice(0, 6);
  if (recent.length === 0) return "User has no dreams in their archive yet.";
  const lines = recent.map((d, i) => {
    const ago = humanAgo(d.created_at);
    const summary = d.raw_text.length > 140 ? d.raw_text.slice(0, 137) + "…" : d.raw_text;
    return `${i + 1}. (${ago}) ${summary}`;
  });
  return `User's recent dreams (most recent first):\n${lines.join("\n")}`;
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export async function chatWithAgent(
  userId: string,
  recentMessages: ChatMessage[],
  newUserMessage: string,
): Promise<ChatResult> {
  // Phone users see only their own dreams. Web users (anonymous demo session)
  // see ALL dreams in the system — that lets a judge SMS a dream from their phone,
  // walk back to the laptop, and continue the conversation about it on the web.
  const allDreams = await listDreams();
  const visible = userId.startsWith("web:")
    ? allDreams
    : allDreams.filter((d) => d.user_phone === userId);
  const archive = dreamArchiveBlock(visible);

  const messages = [
    { role: "system" as const, content: SYSTEM },
    { role: "system" as const, content: archive },
    ...recentMessages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: newUserMessage },
  ];

  const res = await fetch(`${env.gmiLlmBase}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.gmiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.gmiLlmModel,
      response_format: { type: "json_object" },
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`GMI chat failed: ${res.status} — ${t.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("GMI chat: empty content");

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Some models occasionally fence the JSON; strip and retry.
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  }
  const intent = parsed.intent === "new_dream" ? "new_dream" : "chat";
  const reply = String(parsed.reply ?? "").trim() || "🌙";
  return { intent, reply };
}
