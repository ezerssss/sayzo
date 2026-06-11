/**
 * OpenAI's reasoning models (o1/o3/o4/gpt-5 families) don't accept the
 * `temperature` parameter — they calibrate reasoning effort internally. The
 * Vercel AI SDK warns and silently drops the value when you pass one, which
 * pollutes server logs and makes our `CAPTURE_ANALYZER_TEMPERATURE` env var
 * misleading on those models.
 *
 * Use `temperatureOptions(model, t)` and spread the result into `generateText`
 * options — it returns `{ temperature: t }` for chat models and `{}` for
 * reasoning models, suppressing the warning either way.
 */

const REASONING_PREFIX = /^(o[134]|gpt-5)/i;

export function isReasoningModel(model: string): boolean {
    return REASONING_PREFIX.test(model.trim());
}

export function temperatureOptions(
    model: string,
    temperature: number,
): { temperature: number } | Record<string, never> {
    return isReasoningModel(model) ? {} : { temperature };
}

type ModelTuning = {
    /** Used for chat models only — reasoning models reject it (see above). */
    temperature: number;
    /** Reasoning models only. OpenAI's guidance: scale effort DOWN for
     * extraction-style tasks; never crank it up to paper over a weak prompt. */
    reasoningEffort?: "minimal" | "low" | "medium" | "high";
    /** Reasoning models only. Output-length steering — per-field length
     * contracts in the prompt ("2-4 sentences") override this locally. */
    textVerbosity?: "low" | "medium" | "high";
};

/**
 * Per-model-class call options, superset of `temperatureOptions`: chat models
 * get the temperature, reasoning models get `reasoningEffort`/`textVerbosity`
 * via the AI SDK's `providerOptions.openai` passthrough instead. Spread the
 * result into `generateText` options.
 */
export function modelTuningOptions(model: string, tuning: ModelTuning) {
    if (!isReasoningModel(model)) {
        return { temperature: tuning.temperature };
    }
    const openaiOptions: Record<string, string> = {};
    if (tuning.reasoningEffort) {
        openaiOptions.reasoningEffort = tuning.reasoningEffort;
    }
    if (tuning.textVerbosity) {
        openaiOptions.textVerbosity = tuning.textVerbosity;
    }
    return Object.keys(openaiOptions).length > 0
        ? { providerOptions: { openai: openaiOptions } }
        : {};
}
