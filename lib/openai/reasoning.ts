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
