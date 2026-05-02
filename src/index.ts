import { randomUUID } from "node:crypto";
import { chatWithAgent } from "./chat.js";
import { appendMessage, getConversation } from "./conversation.js";
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
  return !t;
}

// Kicks off video generation in the background and posts a follow-up SMS when ready.
async function generateInBackground(dreamId: string, prompt: string, replyChannel: { send: (m: string) => Promise<void> }) {
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
      await replyChannel.send(`✨ Your dream is ready: ${dreamUrl(dreamId)}`);
    } catch (e) {
      console.error(`[${dreamId}] follow-up send failed:`, (e as Error).message);
    }
  } catch (e) {
    const msg = (e as Error).message;
    await updateDream(dreamId, { status: "failed", error: msg });
    console.error(`[${dreamId}] generate failed:`, msg);
    try {
      await replyChannel.send(`🌫️ the dream slipped away (${msg.slice(0, 80)}). try again?`);
    } catch {}
  }
}

async function handleIncomingFromImessage(space: any, message: any): Promise<void> {
  if (message.content?.type !== "text") return;
  if (message.isFromMe || message.fromMe) return;
  const text: string = message.content.text ?? "";
  const sender: string = message.sender?.id ?? "+unknown";
  if (shouldIgnore(text)) return;

  console.log(`← ${sender}: ${text.slice(0, 80)}`);

  // 1. Add user turn to conversation
  const conv = await appendMessage(sender, { role: "user", content: text, channel: "imessage" });

  // 2. Ask the agent for a reply + classify intent
  let agentReply: string;
  let intent: "new_dream" | "chat" = "chat";
  try {
    const result = await chatWithAgent(sender, conv.messages.slice(0, -1), text);
    agentReply = result.reply;
    intent = result.intent;
  } catch (e) {
    console.error("agent failed:", (e as Error).message);
    agentReply = "🌙 something fogged my reading. try again in a moment?";
  }

  // 3. If the agent thinks this is a fresh dream, kick off a render
  let dreamId: string | undefined;
  if (intent === "new_dream") {
    dreamId = randomUUID();
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
    agentReply = `${agentReply}\n\n🌙 Painting it now → ${dreamUrl(dreamId)}`;
  }

  // 4. Persist + send the assistant turn
  await appendMessage(sender, {
    role: "assistant",
    content: agentReply,
    channel: "imessage",
    dream_id: dreamId,
  });
  try {
    await space.send(agentReply);
  } catch (e) {
    console.error(`reply send failed:`, (e as Error).message);
  }

  // 5. Fire-and-forget render if needed
  if (intent === "new_dream" && dreamId) {
    generateInBackground(dreamId, dreamPrompt(text), {
      send: (m) => space.send(m),
    }).catch((e) => console.error("bg gen crashed:", e));
  }
}

async function main() {
  await startServer();

  console.log("Starting Photon Spectrum…");
  const app = await startSpectrum();
  console.log("Spectrum app running. Listening for iMessage…");

  for await (const [space, message] of app.messages) {
    handleIncomingFromImessage(space, message).catch((e) =>
      console.error("handle error:", e),
    );
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
