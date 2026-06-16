/**
 * Best-effort USD price table for the models Sayzo calls, used to stamp an
 * approximate `costUsd` on each `llm_events` doc. These are editable estimates,
 * not billing truth — adjust as provider pricing changes. Unknown models →
 * `null` cost (we never guess a price).
 */

export type TokenPrice = { inputPer1M: number; outputPer1M: number };

/** Per-1M-token prices (USD). Keys are exact model ids; prefix fallback below. */
const OPENAI_TOKEN_PRICES: Record<string, TokenPrice> = {
    "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
    "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
    "gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 2.0 },
    "gpt-5": { inputPer1M: 1.25, outputPer1M: 10 },
    // TTS is billed on input text; output audio has no token price here.
    "gpt-4o-mini-tts": { inputPer1M: 0.6, outputPer1M: 0 },
};

/** Deepgram Nova-3 batch transcription, USD per audio minute (estimate). */
export const DEEPGRAM_NOVA3_PER_MINUTE_USD = 0.0043;

function priceFor(model: string): TokenPrice | null {
    const key = model.trim().toLowerCase();
    if (OPENAI_TOKEN_PRICES[key]) return OPENAI_TOKEN_PRICES[key];
    // Prefix fallback so a dated id (e.g. "gpt-4o-mini-2024-07-18") still prices.
    const match = Object.keys(OPENAI_TOKEN_PRICES).find((k) =>
        key.startsWith(k),
    );
    return match ? OPENAI_TOKEN_PRICES[match] : null;
}

/**
 * Token cost in USD, or null if the model isn't priced or there are no tokens
 * to bill (ASR has null tokens — use `deepgramCostUsd` instead).
 */
export function computeTokenCostUsd(
    model: string,
    inputTokens: number | null,
    outputTokens: number | null,
): number | null {
    if (inputTokens === null && outputTokens === null) return null;
    const price = priceFor(model);
    if (!price) return null;
    const cost =
        ((inputTokens ?? 0) / 1_000_000) * price.inputPer1M +
        ((outputTokens ?? 0) / 1_000_000) * price.outputPer1M;
    return Math.round(cost * 1_000_000) / 1_000_000;
}

export function deepgramCostUsd(durationSecs: number): number {
    const cost = (durationSecs / 60) * DEEPGRAM_NOVA3_PER_MINUTE_USD;
    return Math.round(cost * 1_000_000) / 1_000_000;
}

/** OpenAI gpt-4o-mini-tts, USD per 1M input characters (estimate). */
export const OPENAI_TTS_PER_1M_CHARS_USD = 0.6;

export function ttsCostUsd(chars: number): number {
    const cost = (chars / 1_000_000) * OPENAI_TTS_PER_1M_CHARS_USD;
    return Math.round(cost * 1_000_000) / 1_000_000;
}
