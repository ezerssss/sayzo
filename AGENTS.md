<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Sayzo: schemas are the single source of truth

All durable shapes — domain types, persisted Firestore docs, and LLM-output Zod schemas — live in `schemas/` (organized by domain) and import from the `@/schemas` barrel. **Zod is the source of truth**; TS types are `z.infer<>` co-located in the same file. Don't reintroduce scattered type files under `types/`. UI-only prop/view types stay local to their component.

Per-user coaching state lives in ONE server-only `learner-models/{uid}` doc (access via `lib/learner-model/store.ts`). Per-item drill/capture feedback shares one `ItemAnalysis` shape.
