// Smoke test: connect to Photon Spectrum and echo every incoming text.
//   npm run test:photon
import { startSpectrum } from "../src/photon.js";

async function main() {
  console.log("Connecting to Photon Spectrum…");
  const app = await startSpectrum();
  console.log("Connected. Send an iMessage from a real device to your Photon-assigned number.");
  console.log("Press Ctrl+C to stop.\n");

  for await (const [space, message] of app.messages) {
    if (message.content?.type !== "text") continue;
    const sender = message.sender?.id ?? "?";
    const text = message.content.text ?? "";
    console.log(`← ${sender}: ${text}`);
    try {
      await space.send(`echo: ${text}`);
      console.log(`  → echoed`);
    } catch (e) {
      console.error("send failed:", (e as Error).message);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
