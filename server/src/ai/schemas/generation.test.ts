import { describe, expect, it } from "vitest";
import { ScenarioInput } from "@mystery/shared";
import { countFor, validEvidenceMix } from "./generation.js";
import { biblePrompt, evidenceContentPrompt, solvabilityPrompt } from "../prompts/case.js";

describe("shared and generation schemas", () => {
  it("accepts the scenario bounds and applies defaults", () => {
    expect(ScenarioInput.parse({ scenario: "A jewel disappeared." })).toMatchObject({
      difficulty: "medium",
      tone: "noir",
      language: "en",
    });
    expect(ScenarioInput.safeParse({ scenario: "short" }).success).toBe(false);
    expect(ScenarioInput.safeParse({ scenario: "x".repeat(501) }).success).toBe(false);
  });
  it("keeps the required evidence mix at every difficulty", () => {
    const eight = [
      { type: "chat" },
      { type: "chat" },
      { type: "image" },
      { type: "image" },
      { type: "cctv" },
      { type: "document" },
      { type: "statement" },
      { type: "document" },
    ] as const;
    expect(countFor("easy")).toBe(8);
    expect(validEvidenceMix([...eight], "easy")).toBe(true);
    expect(validEvidenceMix([...eight], "medium")).toBe(false);
  });
  it("keeps pipeline prompts oriented around untrusted seeds and public-only validation", () => {
    expect(biblePrompt).toContain("untrusted story data");
    expect(evidenceContentPrompt).toContain("do not use the words culprit");
    expect(solvabilityPrompt).toContain("only public case information");
  });
});
