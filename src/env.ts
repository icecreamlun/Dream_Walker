import "dotenv/config";

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key}. Copy .env.example → .env`);
  return v;
}

function opt(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  gmiApiKey: need("GMI_API_KEY"),
  gmiT2vModel: opt("GMI_T2V_MODEL", "pixverse-v5.6-t2v"),
  photonProjectId: need("PHOTON_PROJECT_ID"),
  photonProjectSecret: need("PHOTON_PROJECT_SECRET"),
  photonApiBase: opt("PHOTON_API_BASE", "https://spectrum.photon.codes"),
  port: Number(opt("PORT", "8000")),
  publicUrl: opt("PUBLIC_URL", "http://localhost:8000").replace(/\/$/, ""),
};
