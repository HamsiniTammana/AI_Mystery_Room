import { GoogleGenAI } from "@google/genai";
import { z, type ZodType } from "zod";
import { env } from "../config/env.js";

const ai = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = <T>(promise: Promise<T>, ms: number, label: string) => {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
};
const statusCode = (error: unknown) =>
  Number(
    (error as { status?: number; code?: number })?.status ||
      (error as { code?: number })?.code ||
      0,
  );
const jsonFrom = (raw: string) =>
  JSON.parse(
    raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim(),
  );

export async function generateStructured<T>(
  stage: string,
  system: string,
  input: unknown,
  schema: ZodType<T>,
  allowRepair = true,
): Promise<T> {
  if (!ai) throw new Error("Gemini is unavailable: set GEMINI_API_KEY.");
  let repairMessage = "";
  let lastError: unknown;
  for (let validationTry = 0; validationTry < (allowRepair ? 2 : 1); validationTry++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const start = Date.now();
      try {
        const response = await timeout(
          ai.models.generateContent({
            model: env.GEMINI_TEXT_MODEL,
            contents: JSON.stringify({ input, repair: repairMessage || undefined }),
            config: {
              systemInstruction: system,
              responseMimeType: "application/json",
              responseJsonSchema: z.toJSONSchema(schema) as Record<string, unknown>,
            },
          }),
          60_000,
          stage,
        );
        const value = schema.parse(jsonFrom(response.text ?? ""));
        console.info(
          JSON.stringify({
            stage,
            model: env.GEMINI_TEXT_MODEL,
            promptVersion: "v1",
            latencyMs: Date.now() - start,
            tokenUsage: response.usageMetadata,
          }),
        );
        return value;
      } catch (error) {
        lastError = error;
        const status = statusCode(error);
        if (status !== 429 && status < 500) break;
        if (attempt < 2) await pause(500 * 2 ** attempt);
      }
    }
    repairMessage = `Previous output failed required JSON parsing or Zod validation. Correct the output shape and data. Validation issue: ${String(lastError).slice(0, 1200)}. Return only the corrected JSON object.`;
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Gemini ${stage} output failed validation.`);
}

export async function generateImage(prompt: string): Promise<{ data: Buffer; mimeType: string }> {
  if (!ai) throw new Error("Gemini is unavailable: set GEMINI_API_KEY.");
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await timeout(
        ai.models.generateContent({
          model: env.GEMINI_IMAGE_MODEL,
          contents: prompt,
          config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
        }),
        90_000,
        "Image generation",
      );
      for (const part of response.candidates?.[0]?.content?.parts ?? [])
        if (part.inlineData?.data)
          return {
            data: Buffer.from(part.inlineData.data, "base64"),
            mimeType: part.inlineData.mimeType || "image/png",
          };
      throw new Error("Image model returned no image data.");
    } catch (e) {
      last = e;
      if (attempt === 0) await pause(700);
    }
  }
  throw last instanceof Error ? last : new Error("Image generation failed.");
}
