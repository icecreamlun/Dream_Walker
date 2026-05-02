import { HydraDBClient, HydraDBError } from "@hydra_db/node";
import { env } from "./env.js";

// ── Types ──────────────────────────────────────────────

export interface HydraDreamRecord {
  dream_id: string;
  user_phone: string;
  created_at: string; // ISO
  raw_text: string;
  summary: string;
  key_imagery: string[];
  emotion?: string;
  gua_name?: string;
  video_url?: string;
  embedding: number[]; // stored in metadata, not used for search
}

export interface ResonanceMatch {
  dream_id: string;
  user_phone_masked: string;
  summary: string;
  cosine: number;
  final_score: number; // cosine × exp(-Δh / 48)
  created_at: string;
}

// ── Client ─────────────────────────────────────────────

const TENANT = env.hydraNamespace;
const SUB_TENANT = "dreams";

const client = new HydraDBClient({
  token: env.hydraApiKey,
  baseUrl: env.hydraBaseUrl,
});

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}

// ── Tenant lifecycle ───────────────────────────────────

export async function ensureNamespace(): Promise<void> {
  console.log(`[hydra] ensureNamespace tenant=${TENANT}`);
  try {
    await client.tenant.create({ tenant_id: TENANT });
    console.log(`[hydra] tenant create accepted`);
  } catch (e) {
    if (e instanceof HydraDBError) {
      console.log(`[hydra] tenant create returned ${e.statusCode} (likely exists)`);
    } else {
      throw e;
    }
  }
  await waitForTenantReady(180_000, 3000);
}

async function waitForTenantReady(timeoutMs: number, intervalMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const status = await client.tenant.getInfraStatus({ tenant_id: TENANT });
      const infra = (status as any)?.infra;
      if (infra) {
        const graph = infra.graph_status === true;
        const vs = infra.vectorstore_status;
        const vsReady = Array.isArray(vs)
          ? vs.every((v: boolean) => v === true)
          : vs === true;
        if (graph && vsReady) {
          console.log(`[hydra] tenant ready`);
          return;
        }
      }
    } catch { /* retry */ }
    await sleep(intervalMs);
  }
  console.warn(`[hydra] tenant not ready after ${timeoutMs}ms — proceeding anyway`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Insert (memories API) ──────────────────────────────

export async function insertDream(d: HydraDreamRecord): Promise<void> {
  // Only put simple string fields in document_metadata.
  // Arrays and nulls can stall HydraDB free-plan ingestion.
  const docMeta = JSON.stringify({
    dream_id: d.dream_id,
    user_phone: d.user_phone,
    created_at: d.created_at,
    summary: d.summary,
  });

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.upload.addMemory({
        tenant_id: TENANT,
        sub_tenant_id: SUB_TENANT,
        upsert: true,
        memories: [
          {
            source_id: d.dream_id,
            text: d.summary,
            infer: false,
            title: `Dream ${d.dream_id}`,
            document_metadata: docMeta,
          },
        ],
      });
      console.log(`[hydra] inserted dream=${d.dream_id} user=${maskPhone(d.user_phone)}`);
      return;
    } catch (e) {
      if (e instanceof HydraDBError && e.statusCode !== undefined && e.statusCode < 500) {
        console.warn(`[hydra] insertDream(${d.dream_id}) failed ${e.statusCode}: ${e.message.slice(0, 300)}`);
        throw new Error(`HydraDB insertDream failed: ${e.statusCode} ${e.message.slice(0, 200)}`);
      }
      if (attempt === maxAttempts) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`HydraDB insertDream failed after ${maxAttempts} attempts: ${msg.slice(0, 200)}`);
      }
      console.log(`[hydra] insertDream(${d.dream_id}) retry ${attempt}/${maxAttempts}`);
      await sleep(3000);
    }
  }
}

// ── Recall (text-based, HydraDB does its own embedding) ─

export async function findResonance(
  _embedding: number[],
  excludeUser: string,
  k: number = 2,
  queryText?: string,
): Promise<ResonanceMatch[]> {
  const q = (queryText ?? "").trim();
  if (!q) {
    console.warn("[hydra] findResonance called without queryText — returning []");
    return [];
  }

  let matches = await recallAndProcess(q, 20, 0.6, excludeUser, 24);

  if (matches.length < k) {
    console.log(`[hydra] resonance tier1 returned ${matches.length}/${k}, falling back`);
    matches = await recallAndProcess(q, 20, 0, excludeUser, undefined);
  }

  matches.sort((a, b) => b.final_score - a.final_score);
  const topK = matches.slice(0, k);
  console.log(`[hydra] findResonance → ${topK.length} match(es) (k=${k})`);
  return topK;
}

// ── Delete ─────────────────────────────────────────────

export async function deleteDream(id: string): Promise<void> {
  try {
    await client.upload.deleteMemory({
      tenant_id: TENANT,
      memory_id: id,
      sub_tenant_id: SUB_TENANT,
    });
    console.log(`[hydra] deleted dream=${id}`);
  } catch (e) {
    if (e instanceof HydraDBError) {
      console.warn(`[hydra] deleteDream(${id}) failed ${e.statusCode}: ${e.message.slice(0, 200)}`);
    } else {
      console.warn(`[hydra] deleteDream(${id}) failed: ${e}`);
    }
  }
}

// ── Internal helpers ───────────────────────────────────

async function recallAndProcess(
  query: string,
  maxResults: number,
  recencyBias: number,
  excludeUser: string,
  maxAgeHours?: number,
): Promise<ResonanceMatch[]> {
  try {
    const result = await client.recall.recallPreferences({
      tenant_id: TENANT,
      sub_tenant_id: SUB_TENANT,
      query,
      max_results: maxResults,
      recency_bias: recencyBias > 0 ? recencyBias : undefined,
    });

    return postProcess(
      (result.chunks ?? []) as any[],
      (result.sources ?? []) as any[],
      excludeUser,
      maxAgeHours,
    );
  } catch (e) {
    if (e instanceof HydraDBError) {
      console.warn(`[hydra] recall failed ${e.statusCode}: ${e.message.slice(0, 300)}`);
    } else {
      console.warn(`[hydra] recall failed: ${e}`);
    }
    return [];
  }
}

function postProcess(
  chunks: Record<string, any>[],
  sources: Record<string, any>[],
  excludeUser: string,
  maxAgeHours?: number,
): ResonanceMatch[] {
  const now = Date.now();

  // API returns metadata in different fields depending on timing/version.
  // Pick the first one that has actual content (not empty object).
  const sourceMeta = new Map<string, Record<string, any>>();
  for (const s of sources) {
    const candidates = [s.additional_metadata, s.document_metadata, s.metadata, s.tenant_metadata];
    const meta = candidates.find(m => m && typeof m === "object" && Object.keys(m).length > 0) ?? {};
    sourceMeta.set(s.id, meta);
  }

  const bySource = new Map<string, Record<string, any>>();
  for (const c of chunks) {
    const prev = bySource.get(c.source_id);
    if (!prev || (c.relevancy_score ?? 0) > (prev.relevancy_score ?? 0)) {
      bySource.set(c.source_id, c);
    }
  }

  const out: ResonanceMatch[] = [];
  for (const c of Array.from(bySource.values())) {
    const meta = sourceMeta.get(c.source_id) ?? {};

    // additional_metadata may contain our document_metadata fields directly
    // (HydraDB parses the JSON string and flattens it)
    const docMeta: Record<string, any> = meta;

    const userPhone: string = docMeta.user_phone ?? "";
    if (!userPhone || userPhone === excludeUser) continue;

    const createdAt: string = docMeta.created_at ?? c.source_upload_time ?? new Date().toISOString();
    const createdMs = new Date(createdAt).getTime();
    if (!Number.isFinite(createdMs)) continue;

    const deltaH = (now - createdMs) / 3600000;
    if (maxAgeHours !== undefined && deltaH > maxAgeHours) continue;

    const cosine = c.relevancy_score ?? 0;
    const finalScore = cosine * Math.exp(-deltaH / 48);

    out.push({
      dream_id: (docMeta.dream_id ?? c.source_id) as string,
      user_phone_masked: maskPhone(userPhone),
      summary: (docMeta.summary ?? c.chunk_content) as string,
      cosine,
      final_score: finalScore,
      created_at: createdAt,
    });
  }
  return out;
}
