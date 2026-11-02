import type { Evidence, EvidenceType } from "@mystery/shared";
import { env } from "../../config/env.js";
import type { FullCase } from "../../data/store.js";
import {
  bibleStageSchema,
  evidenceContentSchema,
  evidencePlanSchema,
  validatorSchema,
  moderationResultSchema,
  assertBibleConsistency,
  countFor,
  requiredHerrings,
  validEvidenceMix,
  type BibleStage,
  type EvidenceContent,
  type PlanItem,
} from "../schemas/generation.js";
import {
  evidenceContentPrompt,
  evidencePlanPrompt,
  moderationPrompt,
  solvabilityPrompt,
  biblePrompt,
} from "../prompts/case.js";
import { generateImage, generateStructured } from "../geminiClient.js";
import { storageAdapter } from "../../storage/storageAdapter.js";

const appendStyle = (prompt: string, type: EvidenceType) =>
  `${prompt}\n\nStyle: realistic fictional evidence photography, no text unless explicitly required, no real people or celebrities, adults only, no gore or nudity.${type === "cctv" ? " CCTV frame: fixed wide-angle security camera, grainy desaturated monochrome, same location and camera angle across the sequence." : ""}`;
const publicEvidence = (e: Evidence) => ({
  id: e.id,
  type: e.type,
  title: e.title,
  summary: e.summary,
  inWorldTimestamp: e.inWorldTimestamp,
  source: e.source,
  relatedSuspectIds: e.relatedSuspectIds,
  payload: e.payload,
});
const safePublicText = (value: unknown) => JSON.stringify(value);
const forbiddenLeak = /("culpritId"|\bculprit\b)/i;

function evidencePayloadValid(
  type: EvidenceType,
  payload: Record<string, unknown>,
  suspectIds: Set<string>,
) {
  if (type === "chat") {
    const p = payload as any;
    return (
      Array.isArray(p.participants) &&
      Array.isArray(p.messages) &&
      p.messages.length >= 2 &&
      p.messages.every(
        (m: any) =>
          typeof m.text === "string" &&
          typeof m.timestamp === "string" &&
          p.participants.some((u: any) => u.id === m.senderId),
      )
    );
  }
  if (type === "document")
    return (
      typeof payload.kind === "string" &&
      typeof payload.fields === "object" &&
      typeof payload.bodyText === "string"
    );
  if (type === "statement")
    return (
      typeof payload.interviewer === "string" &&
      Array.isArray(payload.transcript) &&
      payload.transcript.length >= 2 &&
      (!payload.speakerSuspectId || suspectIds.has(String(payload.speakerSuspectId)))
    );
  return (
    typeof payload.cameraLabel === "string" &&
    Array.isArray(payload.frames) &&
    payload.frames.length >= 1 &&
    payload.frames.every(
      (f: any) => typeof f.caption === "string" && typeof f.timestamp === "string",
    )
  );
}
function validTimestamp(value: string) {
  return Number.isFinite(Date.parse(value));
}
function inSettingRange(value: string, setting: { date: string; timeRange: string }) {
  const at = new Date(value);
  if (!Number.isFinite(at.getTime()) || at.toISOString().slice(0, 10) !== setting.date)
    return false;
  const match = setting.timeRange.match(
    /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:-|to)\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i,
  );
  if (!match) return false;
  const minutes = (hour: number, minute: number, meridiem?: string) => {
    let h = hour;
    if (meridiem) {
      h %= 12;
      if (meridiem.toUpperCase() === "PM") h += 12;
    }
    return h * 60 + minute;
  };
  const start = minutes(Number(match[1]), Number(match[2]), match[3]),
    end = minutes(Number(match[4]), Number(match[5]), match[6]);
  const current = at.getUTCHours() * 60 + at.getUTCMinutes();
  return end >= start ? current >= start && current <= end : current >= start || current <= end;
}
function validateContent(
  type: EvidenceType,
  content: EvidenceContent,
  suspectIds: Set<string>,
  plan: PlanItem,
  setting: { date: string; timeRange: string },
) {
  if (
    !validTimestamp(content.inWorldTimestamp) ||
    !inSettingRange(content.inWorldTimestamp, setting) ||
    !evidencePayloadValid(type, content.payload, suspectIds)
  )
    throw new Error(`Evidence ${plan.id} has an invalid type payload or timestamp.`);
  if (content.inWorldTimestamp !== plan.inWorldTimestamp)
    throw new Error(`Evidence ${plan.id} changed its planned timestamp.`);
  if (
    (type === "image" && content.imagePrompts.length < 1) ||
    (type === "cctv" && (content.imagePrompts.length < 4 || content.imagePrompts.length > 8))
  )
    throw new Error(`Evidence ${plan.id} has an invalid image prompt count.`);
  if (content.relatedSuspectIds.some((id) => !suspectIds.has(id)))
    throw new Error(`Evidence ${plan.id} references an unknown suspect.`);
  if (
    forbiddenLeak.test(
      safePublicText({
        title: content.title,
        summary: content.summary,
        source: content.source,
        payload: content.payload,
      }),
    )
  )
    throw new Error(`Evidence ${plan.id} contains a forbidden spoiler field or term.`);
  const contactText = safePublicText(content).replace(
    /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?\b/g,
    " ",
  );
  const phoneLike = (contactText.match(/\+?\d[\d ()-]{8,}\d/g) ?? []).some(
    (value) => (value.match(/\d/g) ?? []).length >= 10,
  );
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(contactText) || phoneLike)
    throw new Error(`Evidence ${plan.id} contains real-looking contact information.`);
}

async function moderate(scenario: string) {
  const result = await generateStructured(
    "moderation",
    moderationPrompt,
    { scenario },
    moderationResultSchema,
  );
  if (!result.allowed)
    throw new Error(
      result.reason || "This story seed is not suitable for a fictional detective case.",
    );
}

async function parallelMap<T, R>(
  values: T[],
  limit: number,
  fn: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= values.length) return;
        results[index] = await fn(values[index], index);
      }
    }),
  );
  return results;
}

async function createBible(c: FullCase) {
  const target = c.difficulty === "easy" ? 3 : c.difficulty === "medium" ? 4 : "5 or 6";
  const bible = await generateStructured(
    "bible",
    biblePrompt,
    {
      scenario: c.scenario,
      difficulty: c.difficulty,
      tone: c.tone,
      language: c.language,
      requirements: {
        suspects: target,
        redHerrings: requiredHerrings(c.difficulty),
        requiredEvidenceCount: countFor(c.difficulty),
      },
    },
    bibleStageSchema,
  );
  assertBibleConsistency(bible, c.difficulty);
  if (bible.redHerrings.some((r) => !bible.suspects.some((s) => s.id === r.suspectId)))
    throw new Error("A red herring references an unknown suspect.");
  if (bible.truthTimeline.some((t) => !inSettingRange(t.time, bible.setting)))
    throw new Error("The case bible includes a timeline timestamp outside its setting.");
  return bible;
}
async function createPlan(c: FullCase, bible: BibleStage) {
  const result = await generateStructured(
    "evidence-plan",
    evidencePlanPrompt,
    { bible, difficulty: c.difficulty, requiredItems: countFor(c.difficulty) },
    evidencePlanSchema,
  );
  if (!validEvidenceMix(result.items, c.difficulty))
    throw new Error("The evidence plan does not meet its required count or type mix.");
  if (result.items.some((i) => !inSettingRange(i.inWorldTimestamp, bible.setting)))
    throw new Error("An evidence-plan timestamp is outside the case setting.");
  const ids = new Set(bible.suspects.map((s) => s.id));
  if (new Set(result.items.map((i) => i.id)).size !== result.items.length)
    throw new Error("The evidence plan has duplicate IDs.");
  if (result.items.some((i) => i.relatedSuspectIds.some((s) => !ids.has(s))))
    throw new Error("The evidence plan references an unknown suspect.");
  const planned = new Set(result.items.map((i) => i.id));
  if (bible.decisiveClues.some((clue) => !planned.has(clue.evidenceRef)))
    throw new Error("The evidence plan omits a decisive clue reference.");
  return result.items;
}
async function createContent(
  c: FullCase,
  bible: BibleStage,
  plan: PlanItem[],
  onItemComplete?: (done: number, total: number) => void,
) {
  const suspectIds = new Set(bible.suspects.map((s) => s.id));
  let done = 0;
  return parallelMap(plan, env.GEN_CONCURRENCY, async (item) => {
    const content = await generateStructured(
      "evidence-content",
      evidenceContentPrompt,
      { bible, planItem: item, tone: c.tone },
      evidenceContentSchema,
    );
    validateContent(item.type, content, suspectIds, item, bible.setting);
    const id = item.id;
    const evidence: Evidence = {
      id,
      caseId: c.id,
      type: item.type,
      title: content.title,
      summary: content.summary,
      inWorldTimestamp: content.inWorldTimestamp,
      source: content.source,
      relatedSuspectIds: content.relatedSuspectIds,
      payload: content.payload,
      assetStatus: item.type === "image" || item.type === "cctv" ? "pending" : "ready",
      assets: [],
    };
    done++;
    onItemComplete?.(done, plan.length);
    return { evidence, prompts: content.imagePrompts };
  });
}
async function checkSolvability(c: FullCase, bible: BibleStage, evidence: Evidence[]) {
  const answer = await generateStructured(
    "solvability-validator",
    solvabilityPrompt,
    { briefing: bible.briefing, suspects: bible.suspects, evidence: evidence.map(publicEvidence) },
    validatorSchema,
  );
  return { answer, passed: answer.deducedCulpritId === bible.culpritId };
}

export async function generateCase(
  c: FullCase,
  onProgress: (stage: string, percent: number, message: string) => void,
) {
  try {
    await moderate(c.scenario);
    onProgress("Bible", 5, "Writing the hidden case bible…");
    const bible = await createBible(c);
    onProgress("Evidence plan", 20, "Mapping clues to the case timeline…");
    const plan = await createPlan(c, bible);
    onProgress("Evidence content", 30, "Preparing the evidence file…");
    let generated = await createContent(c, bible, plan, (done, total) =>
      onProgress(
        "Content",
        30 + Math.round((done / total) * 40),
        `Preparing evidence (${done}/${total})…`,
      ),
    );
    let validation = await checkSolvability(
      c,
      bible,
      generated.map((x) => x.evidence),
    );
    if (!validation.passed) {
      onProgress("Evidence repair", 67, "Checking a second evidence pass…");
      const decisive = new Set(bible.decisiveClues.map((x) => x.evidenceRef));
      const repairPlan = plan.filter((item) => decisive.has(item.id));
      const repaired = await createContent(c, bible, repairPlan, (done, total) =>
        onProgress(
          "Evidence repair",
          67 + Math.round((done / total) * 5),
          `Refreshing decisive clues (${done}/${total})…`,
        ),
      );
      const repairedMap = new Map(repaired.map((x) => [x.evidence.id, x]));
      generated = generated.map((x) => repairedMap.get(x.evidence.id) ?? x);
      validation = await checkSolvability(
        c,
        bible,
        generated.map((x) => x.evidence),
      );
    }
    if (!validation.passed)
      throw new Error(
        "The generated evidence did not pass the solvability check. Please retry with a different story seed.",
      );
    const items = generated.map((x) => x.evidence);
    c.title = bible.title;
    c.briefing = bible.briefing;
    c.setting = bible.setting;
    c.suspects = bible.suspects;
    c.evidence = items;
    c.evidenceIds = items.map((e) => e.id);
    c.bible = {
      culpritId: bible.culpritId,
      motive: bible.motive,
      method: bible.method,
      opportunity: bible.opportunity,
      solutionExplanation: bible.solutionExplanation,
      timeline: bible.truthTimeline.map((t) => ({ time: t.time, event: t.event })),
      decisiveClues: bible.decisiveClues,
      hints: bible.hints,
      victimOrIncident: bible.victimOrIncident,
      truthTimeline: bible.truthTimeline,
      suspectTruths: bible.suspectTruths,
      redHerrings: bible.redHerrings,
      validation: { passed: true, report: validation.answer.reasoning },
    };
    c.attemptsLeft = c.difficulty === "easy" ? 3 : c.difficulty === "medium" ? 2 : 1;
    c.status = "ready";
    c.progress = {
      stage: "Text validated",
      percent: 80,
      message: "Your case file is ready. Images are still developing.",
    };
    onProgress("Assets", 80, "Text evidence validated. Developing images…");
    void generateAssets(c, generated, onProgress);
  } catch (error) {
    c.status = "failed";
    c.progress = {
      stage: c.progress.stage,
      percent: c.progress.percent,
      message: error instanceof Error ? error.message : "Case generation failed. Please retry.",
    };
  }
}

async function generateAssets(
  c: FullCase,
  generated: { evidence: Evidence; prompts: string[] }[],
  onProgress: (stage: string, percent: number, message: string) => void,
) {
  let remaining = 24;
  const assets = generated
    .flatMap(({ evidence, prompts }) =>
      evidence.type === "cctv"
        ? prompts.slice(0, 8).map((prompt, ordinal) => ({ evidence, prompt, ordinal }))
        : evidence.type === "image"
          ? prompts.slice(0, 1).map((prompt, ordinal) => ({ evidence, prompt, ordinal }))
          : [],
    )
    .slice(0, 24);
  remaining -= assets.length;
  for (const suspect of c.suspects) {
    if (remaining <= 0) break;
    assets.push({
      evidence: { id: `portrait-${suspect.id}`, type: "image" } as Evidence,
      prompt: `Fictional portrait of ${suspect.name}, ${suspect.age}, ${suspect.role}. Original invented adult character, cinematic case-file portrait, realistic photographic style, no celebrity likeness, no text, no gore, no nudity.`,
      ordinal: 0,
    });
    remaining--;
  }
  const imageFailures = new Set<string>();
  await parallelMap(assets, env.GEN_CONCURRENCY, async ({ evidence, prompt, ordinal }, index) => {
    try {
      const result = await generateImage(appendStyle(prompt, evidence.type));
      const filename = `${evidence.id}-${ordinal}.png`;
      const assetUrl = await storageAdapter.put(
        `${c.id}/${filename}`,
        result.data,
        result.mimeType,
      );
      const asset = {
        url: assetUrl,
        mimeType: result.mimeType,
        alt: evidence.id.startsWith("portrait-")
          ? "Fictional portrait of a case suspect"
          : evidence.type === "cctv"
            ? "AI-generated CCTV frame"
            : "AI-generated fictional evidence image",
        caption: "AI-generated fictional image",
        ordinal,
      };
      if (evidence.id.startsWith("portrait-")) {
        const suspect = c.suspects.find((s) => `portrait-${s.id}` === evidence.id);
        if (suspect) suspect.portraitUrl = asset.url;
      } else {
        const target = c.evidence.find((e) => e.id === evidence.id);
        if (target) target.assets[ordinal] = asset;
      }
    } catch {
      if (!evidence.id.startsWith("portrait-")) imageFailures.add(evidence.id);
    }
    const done = index + 1;
    onProgress(
      "Assets",
      Math.min(99, 80 + Math.round((done / Math.max(assets.length, 1)) * 19)),
      `Developing evidence images (${done}/${assets.length})…`,
    );
  });
  for (const { evidence } of generated)
    if (evidence.type === "image" || evidence.type === "cctv") {
      const target = c.evidence.find((e) => e.id === evidence.id);
      if (target) target.assetStatus = imageFailures.has(evidence.id) ? "failed" : "ready";
    }
  c.progress = {
    stage: "Complete",
    percent: 100,
    message: "All available evidence assets are ready.",
  };
}
