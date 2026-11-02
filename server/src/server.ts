import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import pino from "pino";
import { z } from "zod";
import { ScenarioInput } from "@mystery/shared";
import { env } from "./config/env.js";
import { cases, createSample, createQueuedCase, id, users } from "./data/store.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateCase } from "./ai/pipeline/generateCase.js";
import {
  connectPersistence,
  flushPersistence,
  isPersistenceConnected,
} from "./storage/persistence.js";
import { justificationBonus } from "./services/scoringService.js";

const logger = pino();
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser(env.COOKIE_SECRET));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () =>
    logger.info(
      {
        requestId: req.headers["x-request-id"] || id(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        latencyMs: Date.now() - start,
      },
      "request",
    ),
  );
  next();
});
app.use(
  "/api/v1",
  rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }),
);
const authLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
function owner(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.signedCookies?.session;
  let oid: string | undefined;
  try {
    if (token) oid = (jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload).sub as string;
  } catch {
    /* Expired or invalid cookie: create a fresh guest session below. */
  }
  if (!oid) {
    oid = id();
    const signed = jwt.sign({ sub: oid }, env.JWT_SECRET, { expiresIn: "30d" });
    res.cookie("session", signed, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      signed: true,
      maxAge: 30 * 86400000,
    });
  }
  (req as any).ownerId = oid;
  next();
}
app.use("/api/v1", owner);
app.use(
  "/uploads",
  express.static(path.resolve(env.LOCAL_STORAGE_PATH), {
    fallthrough: false,
    maxAge: env.NODE_ENV === "production" ? "7d" : 0,
  }),
);
app.use("/api/v1", (req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("origin") &&
    req.get("origin") !== env.CLIENT_ORIGIN
  )
    return res
      .status(403)
      .json({ error: { code: "CSRF_REJECTED", message: "This request could not be verified." } });
  res.on("finish", () => void flushPersistence());
  next();
});
const oid = (req: express.Request) => (req as any).ownerId as string;
const fail = (res: express.Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });
const owned = (req: express.Request, res: express.Response, id: string) => {
  const c = cases.get(id);
  return c && c.ownerId === oid(req) ? c : undefined;
};
const publicCase = (c: any) => ({
  id: c.id,
  scenario: c.scenario,
  difficulty: c.difficulty,
  tone: c.tone,
  language: c.language,
  status: c.status,
  progress: c.progress,
  title: c.title,
  briefing: c.briefing,
  setting: c.setting,
  suspects: c.suspects,
  evidenceIds: c.evidenceIds,
  attemptsLeft: c.attemptsLeft,
  hintsUsed: c.hintsUsed,
  notes: c.notes,
  pinnedEvidenceIds: c.pinnedEvidenceIds,
  viewedEvidenceIds: c.viewedEvidenceIds ?? [],
  score: c.status === "resolved" ? c.score : undefined,
  shareId: c.status === "resolved" ? c.shareId : undefined,
  createdAt: c.createdAt,
});
const publicEvidence = (e: any) => ({
  id: e.id,
  caseId: e.caseId,
  type: e.type,
  title: e.title,
  summary: e.summary,
  inWorldTimestamp: e.inWorldTimestamp,
  source: e.source,
  relatedSuspectIds: e.relatedSuspectIds,
  payload: e.payload,
  assetStatus: e.assetStatus,
  assets: e.assets,
});
app.get("/api/v1/health", (_req, res) =>
  res.json({
    status: "ok",
    mode: env.MOCK_AI ? "mock" : "gemini",
    database: isPersistenceConnected() ? "connected" : "memory",
  }),
);
app.get("/api/v1/auth/me", (req, res) => {
  const user = users.get(oid(req));
  res.json(
    user
      ? { user: { id: user.id, email: user.email, displayName: user.displayName }, guest: false }
      : { user: null, guest: true },
  );
});
app.post("/api/v1/auth/signup", authLimit, async (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
      displayName: z.string().min(1).max(60),
    })
    .safeParse(req.body);
  if (!body.success)
    return fail(
      res,
      400,
      "VALIDATION_ERROR",
      "Enter a valid email, name, and password of at least 8 characters.",
    );
  const email = body.data.email.toLowerCase();
  if ([...users.values()].some((u) => u.email === email))
    return fail(res, 409, "EMAIL_EXISTS", "An account with that email already exists.");
  const user = {
    id: id(),
    email,
    passwordHash: await bcrypt.hash(body.data.password, 12),
    displayName: body.data.displayName,
  };
  users.set(user.id, user);
  for (const c of cases.values()) if (c.ownerId === oid(req)) c.ownerId = user.id;
  res.cookie("session", jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: "30d" }), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    signed: true,
  });
  res.status(201).json({ id: user.id, email: user.email, displayName: user.displayName });
});
app.post("/api/v1/auth/login", authLimit, async (req, res) => {
  const body = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(req.body);
  if (!body.success) return fail(res, 400, "VALIDATION_ERROR", "Enter your email and password.");
  const u = [...users.values()].find((x) => x.email === body.data.email.toLowerCase());
  if (!u || !(await bcrypt.compare(body.data.password, u.passwordHash)))
    return fail(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  for (const c of cases.values()) if (c.ownerId === oid(req)) c.ownerId = u.id;
  res.cookie("session", jwt.sign({ sub: u.id }, env.JWT_SECRET, { expiresIn: "30d" }), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    signed: true,
  });
  res.json({ id: u.id, email: u.email, displayName: u.displayName });
});
app.post("/api/v1/auth/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});
app.post("/api/v1/cases", (req, res) => {
  const parsed = ScenarioInput.safeParse(req.body);
  if (!parsed.success)
    return fail(res, 400, "VALIDATION_ERROR", "Scenario must be 10 to 500 characters.");
  if ([...cases.values()].some((c) => c.ownerId === oid(req) && c.status === "generating"))
    return fail(res, 429, "ACTIVE_CASE", "Finish the active investigation before opening another.");
  const today = new Date().toISOString().slice(0, 10);
  const ownedToday = [...cases.values()].filter(
    (c) => c.ownerId === oid(req) && c.createdAt.slice(0, 10) === today,
  ).length;
  const globalToday = [...cases.values()].filter((c) => c.createdAt.slice(0, 10) === today).length;
  if (globalToday >= env.GLOBAL_DAILY_CASE_LIMIT)
    return fail(
      res,
      429,
      "GLOBAL_DAILY_LIMIT",
      "The daily case limit has been reached. Please try again tomorrow.",
    );
  if (ownedToday >= (users.has(oid(req)) ? 10 : 3))
    return fail(res, 429, "DAILY_LIMIT", "You have reached today’s case limit.");
  if (env.MOCK_AI) {
    const c = createSample(
      parsed.data.scenario,
      parsed.data.difficulty,
      parsed.data.tone,
      oid(req),
    );
    c.language = parsed.data.language;
    return res.status(202).json({ caseId: c.id });
  }
  const c = createQueuedCase(
    parsed.data.scenario,
    parsed.data.difficulty,
    parsed.data.tone,
    parsed.data.language,
    oid(req),
  );
  c.status = "generating";
  setImmediate(
    () =>
      void generateCase(c, (stage, percent, message) => {
        if (c.status === "generating" || c.status === "ready")
          c.progress = { stage, percent, message };
      }),
  );
  res.status(202).json({ caseId: c.id });
});
app.get("/api/v1/cases", (req, res) =>
  res.json(
    [...cases.values()]
      .filter((c) => c.ownerId === oid(req))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        difficulty: c.difficulty,
        score: c.score,
        createdAt: c.createdAt,
      })),
  ),
);
app.get("/api/v1/cases/:id", (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c) return fail(res, 404, "NOT_FOUND", "Case not found.");
  res.json(publicCase(c));
});
app.get("/api/v1/cases/:id/progress", (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c) return fail(res, 404, "NOT_FOUND", "Case not found.");
  res.json({ status: c.status, progress: c.progress });
});
app.get("/api/v1/cases/:id/evidence", (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c) return fail(res, 404, "NOT_FOUND", "Case not found.");
  res.json(c.evidence.map(publicEvidence));
});
app.get("/api/v1/cases/:id/evidence/:eid", (req, res) => {
  const c = owned(req, res, req.params.id),
    e = c?.evidence.find((x) => x.id === req.params.eid);
  if (!e) return fail(res, 404, "NOT_FOUND", "Evidence not found.");
  res.json(publicEvidence(e));
});
app.patch("/api/v1/cases/:id/notes", (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c) return fail(res, 404, "NOT_FOUND", "Case not found.");
  const p = z
    .object({ notes: z.string().max(10000), pinnedEvidenceIds: z.array(z.string()).max(50) })
    .safeParse(req.body);
  if (!p.success) return fail(res, 400, "VALIDATION_ERROR", "Notes could not be saved.");
  c.notes = p.data.notes;
  c.pinnedEvidenceIds = p.data.pinnedEvidenceIds.filter((id) => c.evidenceIds.includes(id));
  res.json({ ok: true });
});
app.post("/api/v1/cases/:id/evidence/:eid/viewed", (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c || !c.evidenceIds.includes(req.params.eid))
    return fail(res, 404, "NOT_FOUND", "Evidence not found.");
  c.viewedEvidenceIds ??= [];
  if (!c.viewedEvidenceIds.includes(req.params.eid)) c.viewedEvidenceIds.push(req.params.eid);
  res.json({ ok: true });
});
app.post("/api/v1/cases/:id/hint", (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c) return fail(res, 404, "NOT_FOUND", "Case not found.");
  if (c.status !== "ready")
    return fail(
      res,
      409,
      "CASE_NOT_READY",
      "Wait until the investigation is ready before requesting a hint.",
    );
  if (c.hintsUsed >= 3) return fail(res, 409, "NO_HINTS_LEFT", "No hints remain.");
  const hint = c.bible.hints[c.hintsUsed++];
  res.json({ hint, hintsUsed: c.hintsUsed, scorePenalty: 150 });
});
app.post("/api/v1/cases/:id/accuse", async (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c) return fail(res, 404, "NOT_FOUND", "Case not found.");
  if (c.status === "resolved")
    return fail(res, 409, "CASE_RESOLVED", "This case is already resolved.");
  if (c.status !== "ready")
    return fail(res, 409, "CASE_NOT_READY", "Wait until the investigation is ready before acting.");
  const p = z
    .object({ suspectId: z.string(), justification: z.string().max(600).optional() })
    .safeParse(req.body);
  if (!p.success || !c.suspects.some((s) => s.id === p.data.suspectId))
    return fail(
      res,
      400,
      "INVALID_ACCUSATION",
      "Choose one listed suspect and keep your note under 600 characters.",
    );
  const correct = p.data.suspectId === c.bible.culpritId;
  c.attempts.push({
    suspectId: p.data.suspectId,
    justification: p.data.justification || "",
    at: new Date().toISOString(),
    correct,
  });
  c.attemptsLeft--;
  const resolved = correct || c.attemptsLeft <= 0;
  let bonus = { bonus: 0, comment: "No written reasoning was submitted." };
  if (resolved) {
    c.status = "resolved";
    c.resolvedAt = new Date().toISOString();
    const elapsed = Math.max(0, Date.now() - Date.parse(c.startedAt));
    const timePenalty = Math.min(300, Math.floor(Math.max(0, elapsed - 600000) / 10000));
    if (correct) bonus = await justificationBonus(c, p.data.justification || "");
    const hintPenalty = c.hintsUsed * 150,
      wrongAttemptPenalty =
        (correct ? Math.max(0, c.attempts.length - 1) : c.attempts.length) * 200,
      total = Math.max(
        0,
        1000 - hintPenalty - wrongAttemptPenalty - timePenalty + (correct ? bonus.bonus : 0),
      );
    c.score = total;
    c.scoreBreakdown = {
      base: 1000,
      hintPenalty,
      wrongAttemptPenalty,
      timePenalty,
      justificationBonus: correct ? bonus.bonus : 0,
      total,
      comment: bonus.comment,
    };
    c.shareId = id();
  }
  res.json({
    correct,
    attemptsLeft: c.attemptsLeft,
    resolved,
    score: resolved ? c.score : undefined,
  });
});
app.post("/api/v1/cases/:id/giveup", (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c) return fail(res, 404, "NOT_FOUND", "Case not found.");
  if (c.status !== "ready")
    return fail(
      res,
      409,
      "CASE_NOT_READY",
      "Wait until the investigation is ready before giving up.",
    );
  c.status = "resolved";
  c.resolvedAt = new Date().toISOString();
  c.score = 0;
  c.scoreBreakdown = {
    base: 1000,
    hintPenalty: 0,
    wrongAttemptPenalty: 0,
    timePenalty: 0,
    justificationBonus: 0,
    total: 0,
    comment: "Case revealed by Give Up.",
  };
  c.shareId = id();
  res.json({ resolved: true, score: 0 });
});
app.get("/api/v1/cases/:id/solution", (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c) return fail(res, 404, "NOT_FOUND", "Case not found.");
  if (c.status !== "resolved")
    return fail(res, 409, "NOT_RESOLVED", "The solution is available once the case is resolved.");
  const s = c.suspects.find((x) => x.id === c.bible.culpritId);
  res.json({
    culprit: s,
    motive: c.bible.motive,
    method: c.bible.method,
    timeline: c.bible.timeline,
    decisiveClues: c.bible.decisiveClues,
    explanation: c.bible.solutionExplanation,
    score: c.score,
    scoreBreakdown: c.scoreBreakdown,
    attempts: c.attempts,
  });
});
app.post("/api/v1/cases/:id/retry", (req, res) => {
  const c = owned(req, res, req.params.id);
  if (!c) return fail(res, 404, "NOT_FOUND", "Case not found.");
  if (c.status !== "failed")
    return fail(res, 409, "NOT_FAILED", "Only a failed case can be retried.");
  c.status = "generating";
  c.progress = { stage: "Queued", percent: 0, message: "Retrying case generation…" };
  setImmediate(
    () =>
      void generateCase(c, (stage, percent, message) => {
        if (c.status === "generating" || c.status === "ready")
          c.progress = { stage, percent, message };
      }),
  );
  res.status(202).json({ caseId: c.id, status: c.status });
});
app.get("/api/v1/share/:shareId", (req, res) => {
  const c = [...cases.values()].find(
    (x) => x.shareId === req.params.shareId && x.status === "resolved",
  );
  if (!c) return fail(res, 404, "NOT_FOUND", "Result card not found.");
  res.json({
    title: c.title,
    difficulty: c.difficulty,
    score: c.score,
    verdict: c.attempts.some((a) => a.correct) ? "Solved" : "Case closed",
  });
});
if (env.NODE_ENV === "production") {
  const clientDist = path.resolve(process.cwd(), "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res
    .status(500)
    .json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    });
});
export async function start() {
  await connectPersistence();
  const timer = setInterval(() => void flushPersistence(), 1500);
  timer.unref();
  for (const c of cases.values())
    if (c.status === "queued") {
      c.status = "generating";
      void generateCase(c, (stage, percent, message) => {
        if (c.status === "generating" || c.status === "ready")
          c.progress = { stage, percent, message };
      });
    }
  await flushPersistence();
  return app.listen(env.PORT, () =>
    console.info(`AI Mystery Room API listening on ${env.PORT} (${env.MOCK_AI ? "mock" : "live"})`),
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
