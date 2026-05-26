import { z } from "zod";

import { rewriteVerdictSchema } from "@/schemas/shared/enums";

/**
 * How a fluent native speaker would have phrased one user turn. Conversation-only
 * (captures): every user turn gets one entry, even `keep` ones, so there are no
 * unexplained gaps. The "read straight through" view is stitched in the UI from
 * these — there is no separate prose rewrite on the conversation side.
 *
 * LLM-facing variant: `transcriptIdx` is absent (server-resolved from the
 * verbatim `original` text). `suggestedBeforeIdx` is a forward reference the
 * server bounds-checks and clamps.
 */
export const llmTurnRewriteSchema = z.object({
    original: z.string(),
    rewrite: z.string(),
    verdict: rewriteVerdictSchema,
    note: z.string().nullable(),
    suggestedBeforeIdx: z.number().nullable(),
});
export type LlmTurnRewrite = z.infer<typeof llmTurnRewriteSchema>;

/** Persisted turn rewrite: the LLM shape + the server-resolved transcript index. */
export const turnRewriteSchema = llmTurnRewriteSchema.extend({
    transcriptIdx: z.number(),
});
export type TurnRewrite = z.infer<typeof turnRewriteSchema>;
