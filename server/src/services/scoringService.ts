import { env } from "../config/env.js";
import type { FullCase } from "../data/store.js";
import { generateStructured } from "../ai/geminiClient.js";
import { justificationPrompt } from "../ai/prompts/case.js";
import { justificationSchema } from "../ai/schemas/generation.js";

export async function justificationBonus(c: FullCase, reasoning: string) {
  if (!reasoning.trim()) return { bonus: 0, comment: "No written reasoning was submitted." };
  if (env.MOCK_AI) {
    const lower = reasoning.toLowerCase();
    const cited = (c.bible.decisiveClues ?? []).filter((clue) => {
      const e = c.evidence.find((item) => item.id === clue.evidenceRef);
      return (
        !!e &&
        (lower.includes(e.id.toLowerCase()) ||
          lower.includes(e.title.toLowerCase()) ||
          clue.whatItProves
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 5)
            .some((w) => lower.includes(w)))
      );
    }).length;
    const bonus = cited === 0 ? 0 : Math.min(200, cited * 80);
    return {
      bonus,
      comment: cited
        ? `Your reasoning connected ${cited} decisive clue${cited === 1 ? "" : "s"} to the solution.`
        : "Your note did not cite decisive evidence.",
    };
  }
  try {
    return await generateStructured(
      "justification-score",
      justificationPrompt,
      {
        reasoning,
        decisiveClues: c.bible.decisiveClues,
        solutionExplanation: c.bible.solutionExplanation,
      },
      justificationSchema,
      false,
    );
  } catch {
    return { bonus: 0, comment: "Reasoning could not be scored this time." };
  }
}
