// Without an LLM, we wrap the user's raw text in a cinematic frame so PixVerse
// reliably outputs dreamlike footage instead of literal photographic results.
// When GMI is added later, replace this with a model-rewritten prompt.
export function dreamPrompt(rawText: string): string {
  const cleaned = rawText.replace(/\s+/g, " ").trim();
  return [
    `A surreal cinematic dream sequence. ${cleaned}.`,
    "Style: dreamlike, ethereal, soft focus, slight motion blur, shallow depth of field.",
    "Mood: introspective, half-awake, mysterious.",
    "Lighting: hazy golden hour or moonlit, with volumetric god-rays.",
    "No text, no watermark, no UI elements. Slow pacing.",
  ].join(" ");
}
