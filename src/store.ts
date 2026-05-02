import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface Structured {
  title: string;
  summary: string;
  characters: string[];
  scenes: string[];
  emotions: string[];
  key_imagery: string[];
}

export interface VisualBrief {
  color_palette: string;
  camera_movement: string;
  lighting: string;
  mood_board_tags: string[];
}

export interface Divination {
  gua_name: string;
  gua_meaning: string;
  interpretation: string;
  visual_brief: VisualBrief;
}

export interface ResonanceCard {
  dream_id: string;
  user_phone_masked: string;
  summary: string;
  score: number;
}

export interface Dream {
  dream_id: string;
  user_phone: string;
  created_at: string; // ISO
  raw_text: string;
  prompt: string;
  status: "queued" | "generating" | "ready" | "failed";
  request_id?: string;
  video_url?: string;
  thumbnail_url?: string;
  error?: string;
  structured?: Structured;
  divination?: Divination;
  embedding?: number[];
  resonance?: ResonanceCard[];
}

const FILE = "data/dreams.json";

// Always reload from disk so multiple processes (server + scripts) stay in sync.
// Volume is tiny — at most a few hundred dreams across a hackathon day.
async function load(): Promise<Record<string, Dream>> {
  try {
    const raw = await readFile(FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function persist(dreams: Record<string, Dream>): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(dreams, null, 2), "utf8");
}

export async function saveDream(d: Dream): Promise<void> {
  const dreams = await load();
  dreams[d.dream_id] = d;
  await persist(dreams);
}

export async function updateDream(
  dreamId: string,
  patch: Partial<Dream>,
): Promise<Dream | null> {
  const dreams = await load();
  const cur = dreams[dreamId];
  if (!cur) return null;
  const next = { ...cur, ...patch };
  dreams[dreamId] = next;
  await persist(dreams);
  return next;
}

export async function getDream(dreamId: string): Promise<Dream | null> {
  const dreams = await load();
  return dreams[dreamId] ?? null;
}

export async function listDreams(): Promise<Dream[]> {
  const dreams = await load();
  return Object.values(dreams).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );
}
