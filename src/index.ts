import { env } from "./env.js";
import { ensureNamespace } from "./hydra.js";
import { handleConversation, isLlmConfigured, warmup as llmWarmup } from "./llm.js";
import { startSpectrum } from "./photon.js";
import { renderDream } from "./render-pipeline.js";
import { startServer } from "./server.js";

function shouldIgnore(text: string): boolean {
  return !text.trim();
}

// ── Conversation sessions (in-memory, 5min timeout) ────
//
// The state machine asks ONE clarifying question if the first SMS is short,
// then processes either after enough detail or at turn 3 (forced).

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

// ── Incoming message handler ───────────────────────────

async function handleIncoming(space: any, message: any): Promise<void> {
  if (message.content?.type !== "text") return;
  const text: string = message.content.text ?? "";
  const sender: string = message.sender?.id ?? "+unknown";
  if (message.isFromMe || message.fromMe) return;
  if (shouldIgnore(text)) {
    console.log(`skipping empty msg from ${sender}`);
    return;
  }

  const notify = async (msg: string) => {
    await space.send(msg);
  };

  if (isLlmConfigured()) {
    const session = getSession(sender);
    session.messages.push({ role: "user", content: text });
    const turnCount = session.messages.filter((m) => m.role === "user").length;

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

    // Process: pull every user turn from the session, then hand off to the shared pipeline.
    const dreamTexts = session.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content);
    clearSession(sender);
    renderDream({ sender, rawText: dreamTexts, notify }).catch((e) =>
      console.error("pipeline error:", e),
    );
    return;
  }

  // No LLM configured — still works, just without divination/resonance.
  renderDream({ sender, rawText: text, notify }).catch((e) =>
    console.error("pipeline error:", e),
  );
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
