import type { CaseView, Evidence, Suspect } from "@mystery/shared";

export type Bible = {
  culpritId: string;
  motive: string;
  method: string;
  opportunity: string;
  solutionExplanation: string;
  timeline: { time: string; event: string }[];
  decisiveClues: { evidenceRef: string; whatItProves: string }[];
  hints: string[];
  victimOrIncident?: { description: string; type: string };
  truthTimeline?: { time: string; event: string; whoKnows: string[] }[];
  suspectTruths?: {
    suspectId: string;
    motive: string;
    alibiClaimed: string;
    alibiTruth: string;
    secrets: string[];
  }[];
  redHerrings?: { suspectId: string; clue: string; whyMisleading: string }[];
  validation?: { passed: boolean; report: string };
};
export type FullCase = CaseView & {
  ownerId: string;
  attempts: { suspectId: string; justification: string; at: string; correct: boolean }[];
  bible: Bible;
  evidence: Evidence[];
  startedAt: string;
  resolvedAt?: string;
  scoreBreakdown?: {
    base: number;
    hintPenalty: number;
    wrongAttemptPenalty: number;
    timePenalty: number;
    justificationBonus: number;
    total: number;
    comment?: string;
  };
};
export const cases = new Map<string, FullCase>();
export const users = new Map<
  string,
  { id: string; email: string; passwordHash: string; displayName: string }
>();
export const guests = new Map<string, string>();
export const id = () => crypto.randomUUID();

const suspectSet = (): Suspect[] => [
  {
    id: "s-ada",
    name: "Mara Vale",
    age: 38,
    role: "Event coordinator",
    relationToVictim: "Longtime colleague",
    publicProfile:
      "Kept the event running smoothly; knew every back corridor and service schedule.",
  },
  {
    id: "s-ellis",
    name: "Jonah Reed",
    age: 44,
    role: "Gallery owner",
    relationToVictim: "Business partner",
    publicProfile: "The public face of the gallery, under pressure after a string of poor sales.",
  },
  {
    id: "s-noor",
    name: "Tess Arlow",
    age: 29,
    role: "Restoration artist",
    relationToVictim: "Former apprentice",
    publicProfile: "Quiet, meticulous, and the last person seen near the east wing.",
  },
  {
    id: "s-finn",
    name: "Oren Pike",
    age: 51,
    role: "Security supervisor",
    relationToVictim: "Contractor",
    publicProfile: "Had access to camera controls and insisted the system was working all night.",
  },
];
const chat = (
  participants: { id: string; name: string }[],
  messages: { senderId: string; text: string; timestamp: string }[],
) => ({
  app: "messenger",
  chatName: "After-hours",
  isGroup: false,
  participants,
  messages: messages.map((m, i) => ({ id: `m${i}`, ...m, status: "read" })),
});
export function makeEvidence(caseId: string, suspects: Suspect[]): Evidence[] {
  const related = suspects.map((s) => s.id);
  const env = (
    id: string,
    type: Evidence["type"],
    title: string,
    summary: string,
    time: string,
    source: string,
    payload: Record<string, unknown>,
  ): Evidence => ({
    id,
    caseId,
    type,
    title,
    summary,
    inWorldTimestamp: time,
    source,
    relatedSuspectIds: related,
    payload,
    assetStatus: "ready",
    assets: [],
  });
  return [
    env(
      "e-chat-1",
      "chat",
      "The closing shift",
      "A staff conversation about the evening schedule.",
      "2026-10-18T20:14:00",
      "Mara’s phone",
      {
        ...chat(
          [
            { id: "mara", name: "Mara" },
            { id: "jonah", name: "Jonah" },
          ],
          [
            {
              senderId: "mara",
              text: "East wing is clear. I left the side latch as requested.",
              timestamp: "8:14 PM",
            },
            {
              senderId: "jonah",
              text: "Got it. Please make sure the display case is logged before you go.",
              timestamp: "8:18 PM",
            },
          ],
        ),
      },
    ),
    env(
      "e-chat-2",
      "chat",
      "A late message",
      "A short exchange sent after the gallery closed.",
      "2026-10-18T21:07:00",
      "Oren’s phone",
      {
        ...chat(
          [
            { id: "oren", name: "Oren" },
            { id: "tess", name: "Tess" },
          ],
          [
            { senderId: "tess", text: "Did you reset the east camera?", timestamp: "9:07 PM" },
            {
              senderId: "oren",
              text: "It resets on the hour. Nothing unusual on my end.",
              timestamp: "9:11 PM",
            },
          ],
        ),
      },
    ),
    env(
      "e-img-1",
      "image",
      "Dust on the plinth",
      "A close view of the display base, with a clean rectangular patch in the dust.",
      "2026-10-18T21:20:00",
      "East gallery",
      {
        cameraLabel: "Evidence photograph",
        frames: [
          {
            ordinal: 1,
            timestamp: "9:20 PM",
            caption: "A clean rectangular outline interrupts the dust on the velvet plinth.",
          },
        ],
      },
    ),
    env(
      "e-img-2",
      "image",
      "The service corridor",
      "A dim corridor with a cart parked beside the east wing door.",
      "2026-10-18T20:42:00",
      "Staff corridor",
      {
        cameraLabel: "Evidence photograph",
        frames: [
          {
            ordinal: 1,
            timestamp: "8:42 PM",
            caption: "A linen cart is parked beside the east wing entrance.",
          },
        ],
      },
    ),
    env(
      "e-cctv-1",
      "cctv",
      "Camera 04: East wing",
      "A short sequence from the east-wing corridor camera.",
      "2026-10-18T21:00:00",
      "Camera 04",
      {
        cameraLabel: "CAM 04 · EAST WING",
        frames: [
          { ordinal: 1, timestamp: "9:00 PM", caption: "The corridor is empty." },
          {
            ordinal: 2,
            timestamp: "9:08 PM",
            caption: "A figure in a pale event jacket enters, pushing a linen cart.",
          },
          {
            ordinal: 3,
            timestamp: "9:12 PM",
            caption: "The cart exits; the figure pauses to check the door.",
          },
          { ordinal: 4, timestamp: "9:15 PM", caption: "The corridor is empty again." },
        ],
      },
    ),
    env(
      "e-doc-1",
      "document",
      "Shift access log",
      "A printed door-access record for the evening.",
      "2026-10-18T22:00:00",
      "Security desk",
      {
        kind: "callLog",
        fields: {
          Door: "East service",
          "20:41": "Staff key A-17",
          "21:08": "Door held open 04:12",
          "21:18": "Door closed",
        },
        bodyText:
          "Access entries are recorded by badge. The service door can be held open without a second badge swipe.",
      },
    ),
    env(
      "e-statement-1",
      "statement",
      "Interview: Tess Arlow",
      "Tess describes leaving before the final inventory.",
      "2026-10-19T09:30:00",
      "Interview room",
      {
        speakerSuspectId: "s-noor",
        interviewer: "Detective",
        transcript: [
          { speaker: "Detective", text: "When did you leave the east wing?" },
          {
            speaker: "Tess",
            text: "Before nine. I took the front stairs. The service corridor was already blocked by the linen cart.",
          },
          { speaker: "Detective", text: "Did you have a reason to go back?" },
          { speaker: "Tess", text: "No. I handed my studio key to Mara at the reception desk." },
        ],
      },
    ),
    env(
      "e-doc-2",
      "document",
      "Inventory discrepancy",
      "The final inventory lists a changed display-room count.",
      "2026-10-18T19:55:00",
      "Gallery inventory",
      {
        kind: "note",
        fields: {
          Item: "Silver astronomical dial",
          Expected: "1",
          "Final count": "0",
          Initials: "M.V.",
        },
        bodyText:
          "The count was amended shortly before the doors closed. The original entry is faintly visible beneath the correction.",
      },
    ),
    env(
      "e-statement-2",
      "statement",
      "Interview: Oren Pike",
      "The guard explains the camera reset window.",
      "2026-10-19T10:05:00",
      "Interview room",
      {
        speakerSuspectId: "s-finn",
        interviewer: "Detective",
        transcript: [
          { speaker: "Detective", text: "Could Camera 04 have missed someone?" },
          {
            speaker: "Oren",
            text: "Only during the scheduled reset. That is 9:00 to 9:10, not after.",
          },
          { speaker: "Detective", text: "Who can use the service key?" },
          { speaker: "Oren", text: "Coordinator and security. The spare is logged at reception." },
        ],
      },
    ),
    env(
      "e-doc-3",
      "document",
      "Repair receipt",
      "A receipt for a replacement clasp purchased the morning after the incident.",
      "2026-10-19T11:30:00",
      "Rook & Thread Repairs",
      {
        kind: "receipt",
        fields: { Item: "Brass clasp", Paid: "cash", Customer: "M. Vale", Time: "11:30 AM" },
        bodyText: "The clasp is compatible with the display case’s older locking mechanism.",
      },
    ),
    env(
      "e-chat-3",
      "chat",
      "A reminder to the team",
      "A group chat mentions a jacket and the service corridor.",
      "2026-10-18T18:33:00",
      "Staff group chat",
      {
        ...chat(
          [
            { id: "mara", name: "Mara" },
            { id: "tess", name: "Tess" },
            { id: "oren", name: "Oren" },
          ],
          [
            {
              senderId: "mara",
              text: "Please leave the pale jackets on the linen cart after the reception.",
              timestamp: "6:33 PM",
            },
            { senderId: "oren", text: "Cart is by the east door.", timestamp: "6:36 PM" },
          ],
        ),
      },
    ),
    env(
      "e-img-3",
      "image",
      "The reception desk",
      "A photograph of the desk where spare keys were held.",
      "2026-10-18T20:10:00",
      "Reception",
      {
        cameraLabel: "Evidence photograph",
        frames: [
          {
            ordinal: 1,
            timestamp: "8:10 PM",
            caption:
              "The spare key board is visible behind the reception counter; slot A-17 is empty.",
          },
        ],
      },
    ),
  ];
}

export function createSample(
  scenario: string,
  difficulty: CaseView["difficulty"],
  tone: CaseView["tone"],
  ownerId: string,
): FullCase {
  const caseId = id();
  const suspects = suspectSet();
  const evidence = makeEvidence(caseId, suspects);
  const now = new Date().toISOString();
  const c: FullCase = {
    id: caseId,
    ownerId,
    scenario,
    difficulty,
    tone,
    language: "en",
    status: "ready",
    progress: { stage: "Complete", percent: 100, message: "The case file is ready." },
    title:
      scenario
        .trim()
        .replace(/[.!?].*$/, "")
        .slice(0, 58) || "The Missing Astronomical Dial",
    briefing:
      "At a private gallery reception, a valuable astronomical dial vanished from a locked display. The doors were watched, the guest list was short, and someone knew exactly when the east-wing camera would reset. Examine the records carefully: each clue is incomplete on its own.",
    setting: {
      place: "The Bellwether Gallery",
      date: "18 October 2026",
      timeRange: "7:00 PM – 10:00 PM",
    },
    suspects,
    evidenceIds: evidence.map((e) => e.id),
    attemptsLeft: difficulty === "easy" ? 3 : difficulty === "medium" ? 2 : 1,
    hintsUsed: 0,
    notes: "",
    pinnedEvidenceIds: [],
    viewedEvidenceIds: [],
    createdAt: now,
    startedAt: now,
    attempts: [],
    evidence,
    bible: {
      culpritId: "s-ada",
      motive:
        "Mara had quietly borrowed against the gallery’s next insurance payment and needed to replace the money before the audit.",
      method:
        "She used the linen cart and a spare clasp to conceal the dial, then staged the inventory correction.",
      opportunity:
        "Her event access and knowledge of the scheduled camera reset gave her an unobserved route.",
      solutionExplanation:
        "Mara Vale stole the astronomical dial. The inventory note shows she amended the count before closing. Camera 04’s reset gave her a ten-minute window, and the linen cart shown in the corridor provided cover. The closing chat establishes she knew the east-wing latch and schedule. Finally, the repair receipt ties her to a clasp compatible with the older display lock. The clues work together: access and opportunity are supported by the footage and access log; preparation and concealment by the chats, photograph, and receipt; and the altered count by the inventory document. Tess’s statement is a red herring: it places her away from the wing, while the cart she mentions was already there.",
      timeline: [
        { time: "8:14 PM", event: "Closing messages mention the east wing." },
        { time: "9:00 PM", event: "Camera 04 enters its scheduled reset." },
        { time: "9:08 PM", event: "A figure wheels the linen cart through the corridor." },
        { time: "9:55 PM", event: "The inventory count is amended." },
      ],
      decisiveClues: [
        {
          evidenceRef: "e-cctv-1",
          whatItProves: "The service cart crossed the corridor during the camera reset.",
        },
        {
          evidenceRef: "e-doc-2",
          whatItProves:
            "The culprit had access to the inventory and amended it before the investigation.",
        },
        {
          evidenceRef: "e-doc-3",
          whatItProves: "A clasp compatible with the old case was purchased under Mara’s initials.",
        },
      ],
      hints: [
        "Compare the inventory timing with the camera reset window.",
        "The linen cart links the corridor footage to the staff chat.",
        "Check who amended the count and who later bought a compatible clasp.",
      ],
    },
  };
  cases.set(caseId, c);
  return c;
}

export function createQueuedCase(
  scenario: string,
  difficulty: CaseView["difficulty"],
  tone: CaseView["tone"],
  language: string,
  ownerId: string,
): FullCase {
  const caseId = id();
  const now = new Date().toISOString();
  const c: FullCase = {
    id: caseId,
    ownerId,
    scenario,
    difficulty,
    tone,
    language,
    status: "queued",
    progress: { stage: "Queued", percent: 0, message: "Your investigation is being assembled." },
    title: "New investigation",
    briefing: "Evidence is being gathered for your case.",
    setting: { place: "", date: "", timeRange: "" },
    suspects: [],
    evidenceIds: [],
    attemptsLeft: difficulty === "easy" ? 3 : difficulty === "medium" ? 2 : 1,
    hintsUsed: 0,
    notes: "",
    pinnedEvidenceIds: [],
    viewedEvidenceIds: [],
    createdAt: now,
    startedAt: now,
    attempts: [],
    evidence: [],
    bible: {
      culpritId: "",
      motive: "",
      method: "",
      opportunity: "",
      solutionExplanation: "",
      timeline: [],
      decisiveClues: [],
      hints: [],
    },
  };
  cases.set(caseId, c);
  return c;
}
