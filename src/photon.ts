import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { env } from "./env.js";

export type SpectrumApp = Awaited<ReturnType<typeof Spectrum>>;

export async function startSpectrum(): Promise<SpectrumApp> {
  const app = await Spectrum({
    projectId: env.photonProjectId,
    projectSecret: env.photonProjectSecret,
    providers: [imessage.config()],
  });
  return app;
}
