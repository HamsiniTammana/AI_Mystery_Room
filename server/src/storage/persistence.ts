import mongoose from "mongoose";
import { env } from "../config/env.js";
import { cases, users, type Bible, type FullCase } from "../data/store.js";
import { CaseBibleModel, CaseModel, EvidenceModel, UserModel } from "../models/index.js";

let connected = false;
let flushing = false;
export async function connectPersistence() {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    connected = true;
    const [caseDocs, bibleDocs, evidenceDocs, userDocs] = await Promise.all([
      CaseModel.find().lean(),
      CaseBibleModel.find().lean(),
      EvidenceModel.find().lean(),
      UserModel.find().lean(),
    ]);
    const bibleByCase = new Map(bibleDocs.map((x: any) => [String(x.caseId), x]));
    const evidenceByCase = new Map<string, any[]>();
    for (const evidence of evidenceDocs as any[]) {
      const list = evidenceByCase.get(String(evidence.caseId)) ?? [];
      list.push(evidence);
      evidenceByCase.set(String(evidence.caseId), list);
    }
    for (const raw of caseDocs as any[]) {
      const bible = bibleByCase.get(String(raw._id));
      if (!bible) continue;
      const evidence = (evidenceByCase.get(String(raw._id)) ?? []).map(({ _id, ...e }) => ({
        ...e,
        id: String(_id),
      }));
      const { _id, ...data } = raw;
      const c = { ...data, id: String(_id), evidence, bible: fromBible(bible) } as FullCase;
      if (c.status === "generating") {
        c.status = "queued";
        c.progress = {
          stage: "Queued",
          percent: 0,
          message: "Resuming your investigation after a restart.",
        };
      }
      cases.set(c.id, c);
    }
    for (const raw of userDocs as any[]) {
      users.set(String(raw._id), {
        id: String(raw._id),
        email: raw.email,
        passwordHash: raw.passwordHash,
        displayName: raw.displayName,
      });
    }
    return true;
  } catch (error) {
    connected = false;
    await mongoose.disconnect().catch(() => {});
    if (!env.MOCK_AI)
      throw new Error(
        `MongoDB connection failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    console.warn(
      "MongoDB unavailable; using in-memory mock store.",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
function fromBible(value: any): Bible {
  return {
    culpritId: value.culpritId || "",
    motive: value.motive || "",
    method: value.method || "",
    opportunity: value.opportunity || "",
    solutionExplanation: value.solutionExplanation || "",
    timeline: value.truthTimeline?.map((t: any) => ({ time: t.time, event: t.event })) ?? [],
    decisiveClues: value.decisiveClues ?? [],
    hints: value.hints ?? [],
    victimOrIncident: value.victimOrIncident,
    truthTimeline: value.truthTimeline,
    suspectTruths: value.suspectTruths,
    redHerrings: value.redHerrings,
    validation: value.validation,
  };
}
export function isPersistenceConnected() {
  return connected;
}
export async function flushPersistence() {
  if (!connected || flushing) return;
  flushing = true;
  try {
    const caseOps: any[] = [],
      evidenceOps: any[] = [],
      bibleOps: any[] = [],
      userOps: any[] = [];
    for (const c of cases.values()) {
      const { _id, ...publicCase } = c as any;
      const { bible, evidence, ...stored } = publicCase;
      caseOps.push({
        updateOne: {
          filter: { _id: c.id },
          update: {
            $set: {
              ...stored,
              ownerType: users.has(c.ownerId) ? "user" : "guest",
              bibleId: c.id,
              updatedAt: new Date().toISOString(),
            },
            $setOnInsert: { _id: c.id },
          },
          upsert: true,
        },
      });
      bibleOps.push({
        updateOne: {
          filter: { _id: c.id },
          update: { $set: { caseId: c.id, ...toBible(c) }, $setOnInsert: { _id: c.id } },
          upsert: true,
        },
      });
      for (const item of c.evidence)
        evidenceOps.push({
          updateOne: {
            filter: { _id: item.id },
            update: { $set: { ...item, caseId: c.id }, $setOnInsert: { _id: item.id } },
            upsert: true,
          },
        });
    }
    for (const user of users.values())
      userOps.push({
        updateOne: {
          filter: { _id: user.id },
          update: {
            $set: {
              email: user.email,
              passwordHash: user.passwordHash,
              displayName: user.displayName,
            },
            $setOnInsert: { _id: user.id },
          },
          upsert: true,
        },
      });
    await Promise.all([
      caseOps.length ? CaseModel.bulkWrite(caseOps, { ordered: false }) : Promise.resolve(),
      evidenceOps.length
        ? EvidenceModel.bulkWrite(evidenceOps, { ordered: false })
        : Promise.resolve(),
      bibleOps.length ? CaseBibleModel.bulkWrite(bibleOps, { ordered: false }) : Promise.resolve(),
      userOps.length ? UserModel.bulkWrite(userOps, { ordered: false }) : Promise.resolve(),
    ]);
  } catch (error) {
    console.error("MongoDB persistence write failed", error);
  } finally {
    flushing = false;
  }
}
function toBible(c: FullCase) {
  return {
    victimOrIncident: c.bible.victimOrIncident ?? {
      description: c.briefing,
      type: "fictional case",
    },
    culpritId: c.bible.culpritId,
    motive: c.bible.motive,
    method: c.bible.method,
    opportunity: c.bible.opportunity,
    truthTimeline: c.bible.truthTimeline ?? c.bible.timeline.map((t) => ({ ...t, whoKnows: [] })),
    suspectTruths: c.bible.suspectTruths ?? [],
    redHerrings: c.bible.redHerrings ?? [],
    decisiveClues: c.bible.decisiveClues,
    solutionExplanation: c.bible.solutionExplanation,
    hints: c.bible.hints,
    validation: c.bible.validation ?? {
      passed: c.status === "ready" || c.status === "resolved",
      report: c.progress.message,
    },
  };
}
