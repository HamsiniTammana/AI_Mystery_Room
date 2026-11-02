import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
dotenv.config();
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  MONGODB_URI: z.string().default("mongodb://localhost:27017/ai-mystery-room"),
  JWT_SECRET: z.string().default("local-development-secret-change-me"),
  COOKIE_SECRET: z.string().default("local-cookie-secret-change-me"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-3.1-flash-image"),
  GEN_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  GLOBAL_DAILY_CASE_LIMIT: z.coerce.number().default(200),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default("./uploads"),
  S3_BUCKET: z.string().default(""),
  S3_REGION: z.string().default(""),
  S3_ENDPOINT: z.string().default(""),
  MOCK_AI: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
});
export const env = schema.parse(process.env);
if (!env.MOCK_AI && !env.GEMINI_API_KEY)
  throw new Error("GEMINI_API_KEY is required when MOCK_AI=false");
if (env.STORAGE_DRIVER === "s3" && (!env.S3_BUCKET || !env.S3_REGION))
  throw new Error("S3_BUCKET and S3_REGION are required when STORAGE_DRIVER=s3");
if (
  env.NODE_ENV === "production" &&
  (env.JWT_SECRET.length < 32 ||
    env.COOKIE_SECRET.length < 32 ||
    env.JWT_SECRET.includes("replace-with") ||
    env.COOKIE_SECRET.includes("replace-with"))
)
  throw new Error(
    "Production startup requires unique JWT_SECRET and COOKIE_SECRET values of at least 32 characters.",
  );
