/**
 * Single source of truth for all durable shapes — domain entities, persisted
 * Firestore docs, and LLM-output Zod schemas. Import from `@/schemas`.
 *
 * Zod is the source of truth for coaching/analysis/model shapes; TS types are
 * `z.infer<>` co-located with each schema. Big persisted docs (session, capture,
 * user) are plain types. UI-only shapes (component props) stay local to their
 * component and do NOT belong here.
 */

// Shared building blocks
export * from "./shared/enums";
export * from "./shared/coaching-moment";
export * from "./shared/dimensional-analysis";
export * from "./shared/transcript";

// Per-item analysis (drills + captures)
export * from "./analysis/turn-rewrite";
export * from "./analysis/structural-observation";
export * from "./analysis/item-analysis";

// Focus insights (own collection until Phase 3 folds it into the model)
export * from "./focus/focus-insights";

// Merged learner model
export * from "./learner-model/tracked-pattern";
export * from "./learner-model/learner-model";

// Persisted document shapes
export * from "./session/session";
export * from "./capture/capture";
export * from "./user/user";

// Firestore collection registry
export * from "./firestore/collections";
