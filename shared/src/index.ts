import { z } from "zod";

export const Difficulty = z.enum(["easy", "medium", "hard"]);
export const Tone = z.enum(["noir", "cozy", "thriller", "comedic"]);
export const EvidenceType = z.enum(["chat", "image", "cctv", "document", "statement"]);
export const ScenarioInput = z.object({
  scenario: z.string().trim().min(10).max(500),
  difficulty: Difficulty.default("medium"),
  tone: Tone.default("noir"),
  language: z.string().default("en"),
});
export type Difficulty = z.infer<typeof Difficulty>;
export type Tone = z.infer<typeof Tone>;
export type EvidenceType = z.infer<typeof EvidenceType>;
export type Suspect = {
  id: string;
  name: string;
  age: number;
  role: string;
  relationToVictim: string;
  publicProfile: string;
  portraitUrl?: string;
};
export type Evidence = {
  id: string;
  caseId: string;
  type: EvidenceType;
  title: string;
  summary: string;
  inWorldTimestamp: string;
  source: string;
  relatedSuspectIds: string[];
  payload: Record<string, unknown>;
  assetStatus: "pending" | "ready" | "failed";
  assets: { url: string; mimeType: string; alt: string; caption: string; ordinal: number }[];
};
export type CaseView = {
  id: string;
  scenario: string;
  difficulty: Difficulty;
  tone: Tone;
  language: string;
  status: "queued" | "generating" | "ready" | "resolved" | "failed";
  progress: { stage: string; percent: number; message: string };
  title: string;
  briefing: string;
  setting: { place: string; date: string; timeRange: string };
  suspects: Suspect[];
  evidenceIds: string[];
  attemptsLeft: number;
  hintsUsed: number;
  notes: string;
  pinnedEvidenceIds: string[];
  viewedEvidenceIds: string[];
  score?: number;
  shareId?: string;
  createdAt: string;
};
