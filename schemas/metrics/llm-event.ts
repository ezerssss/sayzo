import { z } from "zod";

/**
 * One record per LLM/ASR/TTS call: operational telemetry (model, tokens, cost,
 * latency) + the quality outcomes computed downstream + the prompt-version hash
 * that produced it. The backbone of prompt-performance monitoring.
 *
 * DELIBERATELY CONTENT-FREE. Every field is a number, a bounded enum, a hash, or
 * an id reference. No transcript text, no `quote`/`anchor` substrings, and no raw
 * `error.message` (the model can echo input into errors — we store a classified
 * `errorClass` instead). Admins who need the underlying text follow `refs` into
 * the existing gated capture/session endpoints.
 */

/** Which call site produced the event. Grouped by domain. */
export const llmPromptKeySchema = z.enum([
    // Capture pipeline
    "capture.deep_analysis",
    "capture.validate",
    "capture.quick_summary",
    "capture.meeting_summary",
    "capture.correction_judge",
    "capture.profile",
    // Replay / drill
    "session.analyze",
    "session.feedback",
    "session.relevance",
    // Interactive
    "feedback_chat",
    // Model updaters / synthesis
    "profile.build_context",
    "planner.replay",
    "learner.context_update",
    "learner.skill_memory",
    "focus.synthesize",
    "company.enrich",
    // Speech
    "asr.deepgram",
    "tts.openai",
    "transcribe.api",
]);
export type LlmPromptKey = z.infer<typeof llmPromptKeySchema>;

export const llmProviderSchema = z.enum(["openai", "deepgram"]);
export type LlmProvider = z.infer<typeof llmProviderSchema>;

/** Classified failure mode — never the raw error message. */
export const llmErrorClassSchema = z.enum([
    "timeout",
    "rate_limit",
    "schema_parse",
    "provider_5xx",
    "provider_4xx",
    "network",
    "unknown",
]);
export type LlmErrorClass = z.infer<typeof llmErrorClassSchema>;

/**
 * Quality outcomes computed AFTER the call (in post-processing) and patched onto
 * the event via `finalize`. These are the signals that used to go only to
 * `console.warn`. Enum codes only — the originating log lines interpolate
 * transcript tokens/anchors, which must never be persisted here.
 */
export const llmQualityOutcomeSchema = z.enum([
    "GENERIC_INSIGHT",
    // DEPRECATED — no longer emitted. A coaching-insight quote that can't be
    // grounded now DEGRADES (drops the quote, keeps the card) instead of
    // killing the card; see INSIGHT_QUOTE_DROPPED. Kept in the enum so
    // historical `llm_events` still parse.
    "TRY_REWRITE_NO_QUOTE",
    "FABRICATED_INSIGHT_BODY",
    "INSIGHT_NULL",
    // Quote repair outcomes (card still shipped): the model's quote wasn't a
    // verbatim match but a strict search recovered the real user line …
    "INSIGHT_QUOTE_RECOVERED",
    // … or no quote could be grounded, so the card shows without a quote.
    "INSIGHT_QUOTE_DROPPED",
    "FABRICATED_TURN_REWRITE",
    "FABRICATED_BETTER_OPTION",
    "DESPEECHIFY_APPLIED",
    "NON_ENGLISH_PASSTHROUGH",
    "REJECTED_NOT_RELEVANT",
    "REJECTED_NOT_ORGANIC",
    "REJECTED_NO_SUBSTANCE",
    "REJECTED_NO_COACHABLE_ENGLISH",
]);
export type LlmQualityOutcome = z.infer<typeof llmQualityOutcomeSchema>;

export const llmEventRefsSchema = z.object({
    uid: z.string().nullable(),
    captureId: z.string().nullable(),
    sessionId: z.string().nullable(),
});
export type LlmEventRefs = z.infer<typeof llmEventRefsSchema>;

export const llmEventSchema = z.object({
    promptKey: llmPromptKeySchema,
    /** sha256 of the resolved static prompt template; "" for ASR/TTS (no prompt). */
    promptVersionHash: z.string(),
    model: z.string(),
    provider: llmProviderSchema,
    /** Null for ASR/TTS (no token accounting). */
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    /** USD; null when the model isn't in the price table or for token-less calls. */
    costUsd: z.number().nonnegative().nullable(),
    latencyMs: z.number().int().nonnegative(),
    success: z.boolean(),
    errorClass: llmErrorClassSchema.nullable(),
    qualityOutcomes: z.array(llmQualityOutcomeSchema).default([]),
    refs: llmEventRefsSchema,
    createdAt: z.string(),
});
export type LlmEvent = z.infer<typeof llmEventSchema>;
