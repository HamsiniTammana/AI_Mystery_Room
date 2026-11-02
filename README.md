# AI Mystery Room

A fictional detective game: enter a story seed, inspect a case file, and solve the mystery from its evidence.

## Run locally

Requirements: Node.js 22.12+ and npm.

1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Run `npm run dev` and open <http://localhost:5173>.

`MOCK_AI=true` is the default and serves a bundled sample investigation without a Gemini key. MongoDB persistence is used when MongoDB is reachable; mock mode falls back to an in-memory store if it is not. To run real generation, set `MOCK_AI=false`, provide `GEMINI_API_KEY`, and make MongoDB reachable at `MONGODB_URI`. Live generation follows separate moderation, Bible, evidence-plan, per-item content, public-only solvability validation, and progressive image asset stages. S3-compatible image storage can be enabled with `STORAGE_DRIVER=s3`; the bucket must permit public reads for returned asset URLs.

## Docker

Copy `.env.example` to `.env`, then run `docker compose up --build`. The Compose file starts MongoDB and the local development client/API.

## Scripts

- `npm run dev` - client and API in watch mode.
- `npm run build` - build shared types, server, and client.
- `npm run lint` - lint client, server, shared code, and end-to-end config.
- `npm run format:check` - check formatting with Prettier.
- `npm run typecheck` - build each TypeScript workspace with strict type checking.
- `npm test` - run the API and pipeline unit/integration tests.
- `npm run e2e` - run the Playwright browser walkthrough.
- `npm run check` - run lint, typecheck, tests, and the browser walkthrough.
- `npm start` - start the built API.

The API listens on port 4000 by default and is rooted at `/api/v1`. All cases, characters and evidence are AI-generated fiction.
