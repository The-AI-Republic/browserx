# Repository Guidelines

## Project Structure & Module Organization
The browser agent lives in `src/`, organized by feature: `src/background` hosts the service worker, `src/content` contains injected scripts, `src/sidepanel` holds the UI, while `src/core`, `src/protocol`, `src/models`, `src/storage`, and `src/utils` provide shared logic and schemas. Prompts and narratives reside in `src/prompts`, and configuration defaults sit in `src/config` alongside `manifest.json`. Build helpers live under `scripts/`. Specs and reference docs are in `specs/` and `docs/`. Production bundles emit to `dist/`. Test fixtures and integrations mirror the feature layout under `tests/`, and UI-focused specs live in `src/tests`.

## Build, Test, and Development Commands
- `npm run dev` starts Vite for live reloading the side panel and content scripts.
- `npm run build` invokes `scripts/build.js` to emit a production-ready Chrome bundle in `dist/`.
- `npm run build:testtool` compiles the e2e helper app in `tests/tools/e2e`.
- `npm run type-check`, `npm run lint`, and `npm run format` enforce TypeScript, ESLint, and Prettier baselines.
- `npm run test` runs Vitest; append `-- --config vitest.dom.config.ts` or `vitest.contract.config.ts` for DOM or contract suites.

## Coding Style & Naming Conventions
Use TypeScript and Svelte with 2-space indentation. Components and content scripts should be PascalCase (for example `SidepanelView.svelte`), shared utilities camelCase, and schema definitions suffixed with `Schema`. Keep module-local constants uppercase. Prettier and ESLint configs are prewired—run the format and lint scripts before review to avoid churn.

## Testing Guidelines
Vitest is the primary framework. Colocate unit specs under `src/tests` or `tests/unit`, naming files `<feature>.spec.ts`; use `<feature>.test.ts` for broader integrations. Contract and DOM suites rely on `vitest.contract.config.ts` and `vitest.dom.config.ts`; favor targeted configs when mocking browser APIs. Maintain high coverage for `src/core` and `src/protocol`, and add shared fixtures to `tests/fixtures` instead of embedding JSON in specs.

## Commit & Pull Request Guidelines
Adopt the conventional commit style seen in history (`feat:`, `refactor:`, `chore:`). Keep subject lines under ~70 characters and describe scope in parentheses when useful (`feat(PageActionTool): …`). Pull requests should summarize behavior changes, link issue IDs, and include screenshots or recordings for UI-facing updates. Confirm `npm run lint`, `npm run type-check`, and `npm run test` succeed before requesting review.

## Agent Configuration Tips
When introducing new capabilities, update `src/config` defaults and verify manifest permissions remain minimal. Validate settings with `verify-config-integration.ts` and `test-api-key-integration.ts` before merging. Document user-facing flows in `docs/` so downstream agents stay aligned.
