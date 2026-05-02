import express from "express";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chatWithAgent } from "./chat.js";
import { appendMessage, getConversation } from "./conversation.js";
import { env } from "./env.js";
import { generateVideo } from "./pixverse.js";
import { dreamPrompt } from "./prompt.js";
import { getDream, listDreams, saveDream, updateDream, type Dream } from "./store.js";

let dreamTpl: string | null = null;
async function getDreamTemplate(): Promise<string> {
  if (!dreamTpl) dreamTpl = await readFile("public/dream.html", "utf8");
  return dreamTpl;
}

// Re-read on every request — public/index.html changes during the hackathon and
// we want hot-reload without restarting the server.
async function getHomeTemplate(): Promise<string> {
  return readFile("public/index.html", "utf8");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dreamUrl(dreamId: string): string {
  return `${env.publicUrl}/dream/${dreamId}`;
}

// Background video generation for web-originated dreams.
async function generateInBackground(dreamId: string, prompt: string) {
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
  } catch (e) {
    const msg = (e as Error).message;
    await updateDream(dreamId, { status: "failed", error: msg });
    console.error(`[${dreamId}] generate failed:`, msg);
  }
}

export function createServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.get("/dreams.json", async (_req, res) => {
    res.json(await listDreams());
  });

  app.get("/conversation/:userId", async (req, res) => {
    const conv = await getConversation(req.params.userId);
    res.json(conv);
  });

  app.post("/chat", async (req, res) => {
    const { user_id, text } = req.body ?? {};
    if (typeof user_id !== "string" || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "user_id and text required" });
      return;
    }
    const userId = user_id.startsWith("web:") ? user_id : `web:${user_id}`;

    const conv = await appendMessage(userId, { role: "user", content: text, channel: "web" });

    let reply: string;
    let intent: "new_dream" | "chat" = "chat";
    try {
      const result = await chatWithAgent(userId, conv.messages.slice(0, -1), text);
      reply = result.reply;
      intent = result.intent;
    } catch (e) {
      console.error("chat agent failed:", (e as Error).message);
      reply = "🌙 something fogged my reading. try again in a moment?";
    }

    let dreamId: string | undefined;
    if (intent === "new_dream") {
      dreamId = randomUUID();
      const prompt = dreamPrompt(text);
      const dream: Dream = {
        dream_id: dreamId,
        user_phone: userId,
        created_at: new Date().toISOString(),
        raw_text: text,
        prompt,
        status: "queued",
      };
      await saveDream(dream);
      reply = `${reply}\n\n🌙 Painting it now → ${dreamUrl(dreamId)}`;
      generateInBackground(dreamId, prompt).catch((e) =>
        console.error("bg gen crashed:", e),
      );
    }

    await appendMessage(userId, {
      role: "assistant",
      content: reply,
      channel: "web",
      dream_id: dreamId,
    });

    res.json({ reply, intent, dream_id: dreamId });
  });

  app.get("/dream/:id", async (req, res) => {
    const d = await getDream(req.params.id);
    const tpl = await getDreamTemplate();
    if (!d) {
      res.status(404).send(
        tpl
          .replace("{{TITLE}}", "Dream not found")
          .replace("{{META}}", "")
          .replace("{{VIDEO_BLOCK}}", `<div class="pending">no dream with id ${escape(req.params.id)}</div>`)
          .replace("{{RAW_TEXT}}", "")
          .replace("{{ERROR_BLOCK}}", "")
          .replace("{{REFRESH_SCRIPT}}", ""),
      );
      return;
    }

    let videoBlock: string;
    let refreshScript = "";
    if (d.status === "ready" && d.video_url) {
      const poster = d.thumbnail_url ? ` poster="${escape(d.thumbnail_url)}"` : "";
      videoBlock = `<div class="video"><video src="${escape(d.video_url)}"${poster} autoplay loop muted playsinline controls></video></div>`;
    } else if (d.status === "failed") {
      videoBlock = `<div class="pending">generation failed</div>`;
    } else {
      videoBlock = `<div class="pending">painting your dream… (${escape(d.status)})</div>`;
      refreshScript = `<script>setTimeout(()=>location.reload(), 5000)</script>`;
    }

    const errorBlock = d.error ? `<div class="err">${escape(d.error)}</div>` : "";
    const meta = `${new Date(d.created_at).toLocaleString()} · ${escape(d.user_phone)}`;

    res.send(
      tpl
        .replace("{{TITLE}}", "Your dream")
        .replace("{{META}}", meta)
        .replace("{{VIDEO_BLOCK}}", videoBlock)
        .replace("{{RAW_TEXT}}", escape(d.raw_text))
        .replace("{{ERROR_BLOCK}}", errorBlock)
        .replace("{{REFRESH_SCRIPT}}", refreshScript),
    );
  });

  app.get("/", async (_req, res) => {
    const tpl = await getHomeTemplate();
    res.send(tpl);
  });

  return app;
}

export function startServer() {
  const app = createServer();
  return new Promise<void>((resolve) => {
    app.listen(env.port, () => {
      console.log(`http://localhost:${env.port}  (public: ${env.publicUrl})`);
      resolve();
    });
  });
}
