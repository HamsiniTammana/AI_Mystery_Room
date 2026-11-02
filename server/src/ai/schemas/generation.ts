import { z } from "zod";
import type { Difficulty, EvidenceType, Suspect, Tone } from "@mystery/shared";
import { EvidenceType as EvidenceTypeSchema } from "@mystery/shared";

export const suspectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2),
  age: z.number().int().min(18).max(110),
  role: z.string(),
  relationToVictim: z.string(),
  publicProfile: z.string(),
  portraitUrl: z.string().optional(),
});
export const bibleStageSchema = z.object({
  title: z.string(),
  briefing: z.string(),
  setting: z.object({
    place: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeRange: z.string(),
  }),
  suspects: z.array(suspectSchema).min(3).max(6),
  victimOrIncident: z.object({ description: z.string(), type: z.string() }),
  culpritId: z.string(),
  motive: z.string(),
  method: z.string(),
  opportunity: z.string(),
  truthTimeline: z
    .array(z.object({ time: z.string(), event: z.string(), whoKnows: z.array(z.string()) }))
    .min(3),
  suspectTruths: z.array(
    z.object({
      suspectId: z.string(),
      motive: z.string(),
      alibiClaimed: z.string(),
      alibiTruth: z.string(),
      secrets: z.array(z.string()),
    }),
  ),
  redHerrings: z.array(
    z.object({ suspectId: z.string(), clue: z.string(), whyMisleading: z.string() }),
  ),
  decisiveClues: z.array(z.object({ evidenceRef: z.string(), whatItProves: z.string() })).min(2),
  solutionExplanation: z.string().min(100),
  hints: z.array(z.string()).length(3),
});
export type BibleStage = z.infer<typeof bibleStageSchema>;
export const planItemSchema = z.object({
  id: z.string(),
  type: EvidenceTypeSchema,
  title: z.string(),
  source: z.string(),
  inWorldTimestamp: z.string(),
  relatedSuspectIds: z.array(z.string()),
  purpose: z.enum(["decisive", "supporting", "red_herring", "context"]),
  contentBrief: z.string(),
});
export const evidencePlanSchema = z.object({ items: z.array(planItemSchema) });
export type PlanItem = z.infer<typeof planItemSchema>;
export const evidenceContentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  inWorldTimestamp: z.string(),
  source: z.string(),
  relatedSuspectIds: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
  imagePrompts: z.array(z.string()).max(8),
});
export type EvidenceContent = z.infer<typeof evidenceContentSchema>;
export const validatorSchema = z.object({
  deducedCulpritId: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export const moderationResultSchema = z.object({ allowed: z.boolean(), reason: z.string() });
export const justificationSchema = z.object({
  bonus: z.number().int().min(0).max(200),
  comment: z.string().max(180),
});
export type ValidationResult = z.infer<typeof validatorSchema>;

export function countFor(difficulty: Difficulty) {
  return difficulty === "easy" ? 8 : difficulty === "medium" ? 12 : 16;
}
export function requiredHerrings(difficulty: Difficulty) {
  return difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
}
export function validEvidenceMix(items: { type: EvidenceType }[], difficulty: Difficulty) {
  const count =
    items.filter((x) => x.type === "chat").length >= 2 &&
    items.filter((x) => x.type === "image").length >= 2 &&
    items.some((x) => x.type === "cctv") &&
    items.some((x) => x.type === "document") &&
    items.some((x) => x.type === "statement");
  return items.length === countFor(difficulty) && count;
}
export function assertBibleConsistency(bible: BibleStage, difficulty: Difficulty) {
  const suspectIds = new Set(bible.suspects.map((s) => s.id));
  if (!suspectIds.has(bible.culpritId))
    throw new Error("Bible culprit must reference an existing suspect.");
  if (
    (difficulty === "easy" && bible.suspects.length !== 3) ||
    (difficulty === "medium" && bible.suspects.length !== 4) ||
    (difficulty === "hard" && (bible.suspects.length < 5 || bible.suspects.length > 6))
  )
    throw new Error("Suspect count does not match difficulty.");
  const expectedHerrings = requiredHerrings(difficulty);
  if (
    bible.redHerrings.length < expectedHerrings ||
    (difficulty === "hard" && bible.redHerrings.length > 4)
  )
    throw new Error("Red herring count does not match difficulty.");
  const nonCulpritIds = bible.suspects.filter((s) => s.id !== bible.culpritId).map((s) => s.id);
  if (nonCulpritIds.some((id) => !bible.suspectTruths.some((t) => t.suspectId === id)))
    throw new Error("Every non-culprit needs a documented truth/alibi.");
  if (bible.suspectTruths.some((t) => !suspectIds.has(t.suspectId)))
    throw new Error("A suspect truth references an unknown person.");
  if (bible.suspects.some((s) => !/^s-[a-z0-9-]+$/.test(s.id)))
    throw new Error("Suspect IDs must be opaque generated IDs.");
}
