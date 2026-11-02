# Implementation decisions

- The app defaults to `MOCK_AI=true` so the case flow can be explored with no API key. Mock mode falls back to memory if MongoDB is not reachable; when MongoDB is available, cases, evidence, private case bibles and users are persisted in separate collections.
- Live generation is split into moderation, case bible, evidence plan, per-item evidence content, public-only solvability validation, and progressive local image generation. The generation API uses schemas from `server/src/ai/schemas` and image outputs are stored under `LOCAL_STORAGE_PATH`.
- Visual identity follows the Section 9.3 dark detective-office direction with a restrained brass accent. The default is noir; difficulty and tone are selectable.
- Gemini model defaults verified against Google AI for Developers model catalog on 2026-10-31: `gemini-3.8-flash` (text) and `gemini-3.1-flash-image` (image). Both remain environment configurable.
- The sample case uses descriptive captions and CSS placeholders so mock mode works without image generation. Live image and CCTV frame generation uses the configured image model and storage adapter.
- Evidence viewing is tracked on the case, and the board supports filtering by evidence type and related suspect.
