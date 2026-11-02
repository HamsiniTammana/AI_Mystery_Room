import supertest from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "./server.js";
import { cases, users } from "./data/store.js";

function findSensitiveKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(findSensitiveKeys);
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, child]) =>
      [
        /^(culpritId|motive|method|opportunity|caseBible|bible)$/i.test(key) ? key : null,
        ...findSensitiveKeys(child),
      ].filter((x): x is string => !!x),
    );
  return [];
}

describe("case API in mock mode", () => {
  beforeEach(() => {
    cases.clear();
    users.clear();
  });

  it("creates, investigates, resolves and shares a complete sample case", async () => {
    const agent = supertest.agent(app);
    const created = await agent
      .post("/api/v1/cases")
      .send({
        scenario: "An astronomical dial vanished during the gallery reception.",
        difficulty: "medium",
        tone: "noir",
        language: "en",
      })
      .expect(202);
    const caseId = created.body.caseId as string;
    const file = await agent.get(`/api/v1/cases/${caseId}`).expect(200);
    expect(file.body.status).toBe("ready");
    expect(file.body.suspects).toHaveLength(4);
    const evidence = await agent.get(`/api/v1/cases/${caseId}/evidence`).expect(200);
    expect(evidence.body).toHaveLength(12);
    expect(new Set(evidence.body.map((item: any) => item.type))).toEqual(
      new Set(["chat", "image", "cctv", "document", "statement"]),
    );
    const wrong = await agent
      .post(`/api/v1/cases/${caseId}/accuse`)
      .send({ suspectId: "s-ellis" })
      .expect(200);
    expect(wrong.body).toMatchObject({ correct: false, attemptsLeft: 1, resolved: false });
    const right = await agent
      .post(`/api/v1/cases/${caseId}/accuse`)
      .send({
        suspectId: "s-ada",
        justification: "The inventory discrepancy and the repair receipt point to Mara.",
      })
      .expect(200);
    expect(right.body).toMatchObject({ correct: true, attemptsLeft: 0, resolved: true });
    const reveal = await agent.get(`/api/v1/cases/${caseId}/solution`).expect(200);
    expect(reveal.body.culprit.id).toBe("s-ada");
    expect(reveal.body.scoreBreakdown.justificationBonus).toBeGreaterThan(0);
    const share = await agent
      .get(`/api/v1/share/${(await agent.get(`/api/v1/cases/${caseId}`)).body.shareId}`)
      .expect(200);
    expect(share.body).not.toHaveProperty("culprit");
    expect(share.body).not.toHaveProperty("solution");
  });

  it("keeps all hidden case-bible fields off non-solution endpoints", async () => {
    const agent = supertest.agent(app);
    const created = await agent
      .post("/api/v1/cases")
      .send({
        scenario: "A lighthouse ledger was altered just before a storm.",
        difficulty: "easy",
      })
      .expect(202);
    const caseId = created.body.caseId as string;
    const responses = [
      await agent.get("/api/v1/auth/me"),
      await agent.get("/api/v1/cases"),
      await agent.get(`/api/v1/cases/${caseId}`),
      await agent.get(`/api/v1/cases/${caseId}/progress`),
      await agent.get(`/api/v1/cases/${caseId}/evidence`),
    ];
    const items = responses[4].body as Array<{ id: string }>;
    for (const item of items)
      responses.push(await agent.get(`/api/v1/cases/${caseId}/evidence/${item.id}`));
    responses.push(
      await agent
        .patch(`/api/v1/cases/${caseId}/notes`)
        .send({ notes: "Follow the cart.", pinnedEvidenceIds: [] }),
    );
    responses.push(await agent.post(`/api/v1/cases/${caseId}/hint`).send({}));
    for (const response of responses) expect(findSensitiveKeys(response.body)).toEqual([]);
    await agent.get(`/api/v1/cases/${caseId}/solution`).expect(409);
  });
});
