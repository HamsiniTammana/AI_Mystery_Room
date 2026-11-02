import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ generateStructured: vi.fn(), generateImage: vi.fn() }));
vi.mock("../geminiClient.js", () => mocked);
import { createQueuedCase, cases } from "../../data/store.js";
import type { EvidenceType } from "@mystery/shared";
import type { PlanItem } from "../schemas/generation.js";
import { generateCase } from "./generateCase.js";

const suspects = [
  {
    id: "s-ada",
    name: "Mara Vale",
    age: 38,
    role: "Coordinator",
    relationToVictim: "Colleague",
    publicProfile: "Organized the event.",
  },
  {
    id: "s-ellis",
    name: "Jonah Reed",
    age: 44,
    role: "Owner",
    relationToVictim: "Partner",
    publicProfile: "Runs the gallery.",
  },
  {
    id: "s-noor",
    name: "Tess Arlow",
    age: 29,
    role: "Artist",
    relationToVictim: "Former apprentice",
    publicProfile: "Works in the studio.",
  },
  {
    id: "s-finn",
    name: "Oren Pike",
    age: 51,
    role: "Guard",
    relationToVictim: "Contractor",
    publicProfile: "Works security.",
  },
];
const timestamp = "2026-10-31T20:00:00Z";
const bible = {
  title: "The Missing Dial",
  briefing:
    "A silver dial disappeared during a quiet gallery reception. A camera reset and an amended inventory leave several questions.",
  setting: { place: "North Gallery", date: "2026-10-31", timeRange: "19:00-22:00" },
  suspects,
  victimOrIncident: { description: "A silver dial is missing.", type: "theft" },
  culpritId: "s-ada",
  motive: "Financial pressure.",
  method: "Used a service cart.",
  opportunity: "Knew the scheduled camera reset.",
  truthTimeline: [{ time: timestamp, event: "The camera resets.", whoKnows: ["s-ada"] }],
  suspectTruths: suspects
    .slice(1)
    .map((s) => ({
      suspectId: s.id,
      motive: "Had a reason to want the item.",
      alibiClaimed: "Was elsewhere.",
      alibiTruth: "A record verifies the alibi.",
      secrets: [],
    })),
  redHerrings: [
    { suspectId: "s-ellis", clue: "A debt note.", whyMisleading: "It predates the incident." },
    { suspectId: "s-noor", clue: "Studio access.", whyMisleading: "A witness clears the timing." },
  ],
  decisiveClues: [
    { evidenceRef: "plan-1", whatItProves: "The schedule gave the thief opportunity." },
    { evidenceRef: "plan-2", whatItProves: "The altered count supports preparation." },
  ],
  solutionExplanation:
    "Mara used the planned camera reset and service cart to remove the silver dial. The access log and inventory change establish the opportunity and preparation; a repair record connects the physical method.",
  hints: [
    "Compare the reset with the access log.",
    "The inventory was changed before the item was missed.",
    "Read the repair record alongside the corridor footage.",
  ],
};
const types: EvidenceType[] = [
  "chat",
  "chat",
  "image",
  "image",
  "cctv",
  "document",
  "statement",
  "document",
  "chat",
  "document",
  "image",
  "statement",
];
const plan: PlanItem[] = types.map((type, index) => ({
  id: `plan-${index + 1}`,
  type,
  title: `Record ${index + 1}`,
  source: "Gallery archive",
  inWorldTimestamp: timestamp,
  relatedSuspectIds: suspects.map((s) => s.id),
  purpose: index < 2 ? "decisive" : "supporting",
  contentBrief: "A neutral record relevant to the evening.",
}));
function contentFor(item: PlanItem) {
  const payload: any =
    item.type === "chat"
      ? {
          app: "messenger",
          chatName: "Staff",
          isGroup: true,
          participants: suspects.map((s) => ({ id: s.id, name: s.name })),
          messages: [
            {
              id: "m1",
              senderId: "s-ada",
              text: "The corridor is clear.",
              timestamp: "8:00 PM",
              status: "read",
            },
            {
              id: "m2",
              senderId: "s-ellis",
              text: "Thanks for the update.",
              timestamp: "8:02 PM",
              status: "read",
            },
          ],
        }
      : item.type === "document"
        ? {
            kind: "note",
            fields: { record: "inventory" },
            bodyText: "The count was recorded before closing.",
          }
        : item.type === "statement"
          ? {
              speakerSuspectId: "s-noor",
              interviewer: "Detective",
              transcript: [
                { speaker: "Detective", text: "When did you leave?" },
                { speaker: "Tess", text: "Before the scheduled reset." },
              ],
            }
          : {
              cameraLabel: item.type === "cctv" ? "CAM 04" : "Evidence photograph",
              frames:
                item.type === "cctv"
                  ? Array.from({ length: 4 }, (_, i) => ({
                      ordinal: i + 1,
                      timestamp: "20:00",
                      caption: `A cart is visible in frame ${i + 1}.`,
                    }))
                  : [
                      {
                        ordinal: 1,
                        timestamp: "20:00",
                        caption: "A clean outline remains on the display base.",
                      },
                    ],
            };
  return {
    title: item.title,
    summary: "A neutral observation from the evening.",
    inWorldTimestamp: item.inWorldTimestamp,
    source: item.source,
    relatedSuspectIds: item.relatedSuspectIds,
    payload,
    imagePrompts:
      item.type === "cctv"
        ? ["frame 1", "frame 2", "frame 3", "frame 4"]
        : item.type === "image"
          ? ["fictional still"]
          : [],
  };
}
function setupMock(validatorId = "s-ada") {
  let validationCalls = 0;
  mocked.generateStructured.mockImplementation(
    async (stage: string, _system: string, input: any) => {
      if (stage === "moderation") return { allowed: true, reason: "" };
      if (stage === "bible") return bible;
      if (stage === "evidence-plan") return { items: plan };
      if (stage === "evidence-content") return contentFor(input.planItem);
      if (stage === "solvability-validator") {
        validationCalls++;
        return {
          deducedCulpritId: validatorId,
          confidence: 0.9,
          reasoning:
            "The schedule and inventory record independently support the same explanation.",
        };
      }
      throw new Error(`Unexpected stage ${stage}`);
    },
  );
  mocked.generateImage.mockRejectedValue(new Error("Image API not available in fixture test."));
  return () => validationCalls;
}

describe("live generation pipeline orchestration", () => {
  beforeEach(() => {
    cases.clear();
    mocked.generateStructured.mockReset();
    mocked.generateImage.mockReset();
  });
  it("builds twelve schema-valid evidence items and gates readiness on public-only validation", async () => {
    const countValidations = setupMock();
    const c = createQueuedCase(
      "A dial vanished during a gallery reception.",
      "medium",
      "noir",
      "en",
      "guest-test",
    );
    c.status = "generating";
    await generateCase(c, () => {});
    expect(c.status).toBe("ready");
    expect(c.evidence).toHaveLength(12);
    expect(c.suspects).toHaveLength(4);
    expect(c.bible.validation?.passed).toBe(true);
    expect(countValidations()).toBe(1);
    const validatorCall = mocked.generateStructured.mock.calls.find(
      (call) => call[0] === "solvability-validator",
    );
    expect(JSON.stringify(validatorCall?.[2])).not.toContain("culpritId");
    expect(JSON.stringify(validatorCall?.[2])).not.toContain("Financial pressure");
  });
  it("regenerates decisive evidence once and marks the case failed after a second validator miss", async () => {
    const countValidations = setupMock("s-noor");
    const c = createQueuedCase(
      "A dial vanished during a gallery reception.",
      "medium",
      "noir",
      "en",
      "guest-test",
    );
    c.status = "generating";
    await generateCase(c, () => {});
    expect(countValidations()).toBe(2);
    expect(
      mocked.generateStructured.mock.calls.filter((call) => call[0] === "evidence-content"),
    ).toHaveLength(14);
    expect(c.status).toBe("failed");
    expect(c.progress.message).toContain("solvability check");
  });
});
