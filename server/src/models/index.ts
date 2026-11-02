import mongoose, { Schema } from "mongoose";

const loose = { strict: false, versionKey: false as const };
const userSchema = new Schema(
  {
    _id: { type: String },
    email: { type: String, unique: true, sparse: true, index: true },
    passwordHash: { type: String },
    displayName: { type: String },
  },
  loose,
);
const caseSchema = new Schema(
  {
    _id: { type: String },
    ownerType: { type: String, enum: ["user", "guest"], default: "guest" },
    ownerId: { type: String, index: true },
    scenario: String,
    difficulty: String,
    tone: String,
    language: String,
    status: String,
    progress: Schema.Types.Mixed,
    title: String,
    briefing: String,
    setting: Schema.Types.Mixed,
    suspects: [Schema.Types.Mixed],
    evidenceIds: [String],
    bibleId: String,
    attempts: [Schema.Types.Mixed],
    hintsUsed: Number,
    notes: String,
    pinnedEvidenceIds: [String],
    viewedEvidenceIds: [String],
    startedAt: String,
    resolvedAt: String,
    score: Number,
    shareId: { type: String, unique: true, sparse: true, index: true },
    createdAt: String,
    updatedAt: String,
  },
  loose,
);
caseSchema.index({ ownerId: 1, createdAt: -1 });
const evidenceSchema = new Schema(
  {
    _id: { type: String },
    caseId: { type: String, index: true },
    type: String,
    title: String,
    summary: String,
    inWorldTimestamp: String,
    source: String,
    relatedSuspectIds: [String],
    payload: Schema.Types.Mixed,
    assetStatus: String,
    assets: [Schema.Types.Mixed],
    isCritical: Boolean,
  },
  loose,
);
const bibleSchema = new Schema(
  {
    _id: { type: String },
    caseId: { type: String, unique: true, index: true },
    victimOrIncident: Schema.Types.Mixed,
    culpritId: String,
    motive: String,
    method: String,
    opportunity: String,
    truthTimeline: [Schema.Types.Mixed],
    suspectTruths: [Schema.Types.Mixed],
    redHerrings: [Schema.Types.Mixed],
    decisiveClues: [Schema.Types.Mixed],
    solutionExplanation: String,
    hints: [String],
    validation: Schema.Types.Mixed,
  },
  loose,
);
export const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
export const CaseModel = mongoose.models.Case || mongoose.model("Case", caseSchema);
export const EvidenceModel = mongoose.models.Evidence || mongoose.model("Evidence", evidenceSchema);
export const CaseBibleModel = mongoose.models.CaseBible || mongoose.model("CaseBible", bibleSchema);
