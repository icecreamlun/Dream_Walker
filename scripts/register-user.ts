// Register your phone as a "shared user" of the Photon project.
// Photon assigns you a number from the shared pool — that's the number you'll text.
//
//   npm run register -- +14155551234
//
// On success, prints:
//   - the user UUID (save this if you want)
//   - the assigned Photon phone number
//   - a redirect URL — open it on the SAME iPhone, it deep-links into iMessage pre-filled.
import { env } from "../src/env.js";

async function main() {
  const phone = process.argv[2];
  if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
    console.error("Usage: npm run register -- +1XXXXXXXXXX");
    process.exit(1);
  }

  const basic = Buffer.from(`${env.photonProjectId}:${env.photonProjectSecret}`).toString("base64");
  const url = `${env.photonApiBase}/projects/${env.photonProjectId}/users/`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "shared", phoneNumber: phone }),
  });
  const data: any = await res.json();
  if (!res.ok || !data.succeed) {
    console.error(`HTTP ${res.status}`, data);
    process.exit(1);
  }
  const u = data.data;
  console.log("✅ shared user registered");
  console.log("   user id:        ", u.id);
  console.log("   your phone:     ", u.phoneNumber);
  console.log("   text this number:", u.assignedPhoneNumber);
  console.log();
  console.log("Open this link on the SAME iPhone (it deep-links iMessage):");
  console.log(`   ${env.photonApiBase}/users/${u.id}/redirect?msg=Hi%20Dream%20Walker`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
