import express from "express";
import { readFile } from "node:fs/promises";
import { env } from "./env.js";
import { getDream, listDreams } from "./store.js";

let template: string | null = null;
async function getTemplate(): Promise<string> {
  if (!template) template = await readFile("public/dream.html", "utf8");
  return template;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createServer() {
  const app = express();

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.get("/dreams.json", async (_req, res) => {
    res.json(await listDreams());
  });

  app.get("/dream/:id", async (req, res) => {
    const d = await getDream(req.params.id);
    const tpl = await getTemplate();
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
    const dreams = await listDreams();
    res.send(`<!doctype html><meta charset=utf-8><title>Dream Walker</title>
<style>body{font-family:system-ui;background:#0c0a14;color:#f3eee5;padding:32px;max-width:720px;margin:auto}a{color:#c8b48a;text-decoration:none}h1{font-weight:400}li{padding:8px 0;border-bottom:1px solid #221a30}small{color:#a8a094}</style>
<h1>🌙 Dream Walker</h1>
<p>${dreams.length} dream${dreams.length === 1 ? "" : "s"} archived.</p>
<ul>${dreams
      .map(
        (d) =>
          `<li><a href="/dream/${d.dream_id}">${escape(d.raw_text.slice(0, 80))}${d.raw_text.length > 80 ? "…" : ""}</a><br><small>${new Date(d.created_at).toLocaleString()} · ${d.status}${d.user_phone ? " · " + escape(d.user_phone) : ""}</small></li>`,
      )
      .join("")}</ul>`);
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
