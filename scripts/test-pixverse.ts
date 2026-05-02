// Smoke test: run one t2v through GMI Cloud.
//   npm run test:pixverse -- "I dreamt I was flying over a glass ocean with a giant clock underwater"
import { generateVideo } from "../src/pixverse.js";

const prompt = process.argv.slice(2).join(" ").trim() ||
  "A surreal cinematic dream: a lone figure soaring above a vast crystalline ocean at twilight, a colossal antique clock submerged below, ethereal soft lighting, slow motion";

console.log("prompt:", prompt);
console.time("gmi");
generateVideo(prompt)
  .then(({ requestId, url, thumbnail }) => {
    console.timeEnd("gmi");
    console.log("request_id:", requestId);
    console.log("video:    ", url);
    if (thumbnail) console.log("thumbnail:", thumbnail);
  })
  .catch((err) => {
    console.timeEnd("gmi");
    console.error("FAILED:", err.message);
    process.exit(1);
  });
