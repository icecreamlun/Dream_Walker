// Per-user conversation log. Same store backs the iMessage thread and the web chat,
// so a question typed in the browser can be followed up via SMS (and vice versa).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  channel: "imessage" | "web";
  dream_id?: string; // set when a "user" turn was a fresh dream that we generated a video for
}

export interface Conversation {
  user_id: string; // phone number ("+1...") or anonymous web UUID ("web:xxxx")
  messages: ChatMessage[];
}

const FILE = "data/conversations.json";

async function load(): Promise<Record<string, Conversation>> {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return {};
  }
}

async function persist(all: Record<string, Conversation>): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(all, null, 2), "utf8");
}

export async function getConversation(userId: string): Promise<Conversation> {
  const all = await load();
  return all[userId] ?? { user_id: userId, messages: [] };
}

export async function appendMessage(
  userId: string,
  msg: Omit<ChatMessage, "timestamp">,
): Promise<Conversation> {
  const all = await load();
  const conv = all[userId] ?? { user_id: userId, messages: [] };
  conv.messages.push({ ...msg, timestamp: new Date().toISOString() });
  // keep last 40 turns to avoid runaway prompts
  if (conv.messages.length > 40) conv.messages = conv.messages.slice(-40);
  all[userId] = conv;
  await persist(all);
  return conv;
}
