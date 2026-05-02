import express from "express";
import { readFile } from "node:fs/promises";
import { chatWithAgent } from "./chat.js";
import { appendMessage, getConversation } from "./conversation.js";
import { env } from "./env.js";
import { renderDream } from "./render-pipeline.js";
import { getDream, listDreams } from "./store.js";

async function getDreamTemplate(): Promise<string> {
  return readFile("public/dream.html", "utf8");
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
      // No notify — the web user is already on the page; the dream card auto-refreshes.
      dreamId = await renderDream({ sender: userId, rawText: text });
      reply = `${reply}\n\n🌙 Painting it now → ${dreamUrl(dreamId)}`;
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
          .replace("{{DIVINATION_BLOCK}}", "")
          .replace("{{RESONANCE_BLOCK}}", "")
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

    // Divination block
    let divinationBlock = "";
    if (d.divination) {
      divinationBlock = `
  <div class="divination">
    <div class="gua-header">
      <span class="gua-name">${escape(d.divination.gua_name)}</span>
      <span class="gua-meaning">${escape(d.divination.gua_meaning)}</span>
    </div>
    <div class="interpretation">${escape(d.divination.interpretation)}</div>
  </div>`;
    }

    // Resonance block
    let resonanceBlock = "";
    if (d.resonance && d.resonance.length > 0) {
      const cards = d.resonance
        .map(
          (r) => `
    <div class="resonance-card">
      <div class="card-summary">${escape(r.summary)}</div>
      <div class="card-meta">dreamer ${escape(r.user_phone_masked)} · resonance ${(r.score * 100).toFixed(0)}%</div>
    </div>`,
        )
        .join("");
      resonanceBlock = `
  <div class="resonance">
    <div class="resonance-title">Others who dreamt alike last night</div>
    <div class="resonance-cards">${cards}
    </div>
  </div>`;
    }

    const errorBlock = d.error ? `<div class="err">${escape(d.error)}</div>` : "";
    const title = d.structured?.title ?? "Your dream";
    const meta = `${new Date(d.created_at).toLocaleString()} · ${escape(d.user_phone)}`;

    res.send(
      tpl
        .replace("{{TITLE}}", escape(title))
        .replace("{{META}}", meta)
        .replace("{{VIDEO_BLOCK}}", videoBlock)
        .replace("{{RAW_TEXT}}", escape(d.raw_text))
        .replace("{{DIVINATION_BLOCK}}", divinationBlock)
        .replace("{{RESONANCE_BLOCK}}", resonanceBlock)
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
