import { env } from "./env.js";

const MODEL = "text-embedding-3-small";
const DIM = 1536;

export function buildEmbeddingInput(summary: string, keyImagery: string[]): string {
  return `${summary} | ${keyImagery.join(", ")}`;
}

export async function embed(text: string): Promise<number[]> {
  return (await embedBatch([text]))[0];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  if (!env.openaiApiKey) {
    console.warn("[embed] OPENAI_API_KEY not set — returning zero vectors");
    return texts.map(() => new Array(DIM).fill(0));
  }
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
