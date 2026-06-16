import "server-only";

import { computeTokenCostUsd } from "@/constants/llm-pricing";
import { classifyError } from "./error-class";
import { promptVersionHash } from "./prompt-version";
import { writeLlmEvent, type LlmEventHandle } from "./write-event";
import type {
    LlmErrorClass,
    LlmEvent,
    LlmEventRefs,
    LlmPromptKey,
    LlmProvider,
    LlmQualityOutcome,
} from "@/schemas";

export type PromptParts = {
    system?: string;
    postTranscriptRecap?: string | null;
};

type UsageLike =
    | { inputTokens?: number | null; outputTokens?: number | null }
    | null
    | undefined;

function resolveRefs(partial?: Partial<LlmEventRefs>): LlmEventRefs {
    return {
        uid: partial?.uid ?? null,
        captureId: partial?.captureId ?? null,
        sessionId: partial?.sessionId ?? null,
    };
}

function buildEvent(args: {
    promptKey: LlmPromptKey;
    model: string;
    provider: LlmProvider;
    promptParts?: PromptParts;
    refs?: Partial<LlmEventRefs>;
    latencyMs: number;
    success: boolean;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    errorClass: LlmErrorClass | null;
    qualityOutcomes?: LlmQualityOutcome[];
}): LlmEvent {
    return {
        promptKey: args.promptKey,
        promptVersionHash: promptVersionHash(args.promptParts),
        model: args.model,
        provider: args.provider,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        costUsd: args.costUsd,
        latencyMs: args.latencyMs,
        success: args.success,
        errorClass: args.errorClass,
        qualityOutcomes: args.qualityOutcomes ?? [],
        refs: resolveRefs(args.refs),
        createdAt: new Date().toISOString(),
    };
}

export type InstrumentInput<T> = {
    promptKey: LlmPromptKey;
    model: string;
    provider?: LlmProvider;
    /** Resolved static prompt parts → version hash. Omit for ASR/TTS. */
    promptParts?: PromptParts;
    refs?: Partial<LlmEventRefs>;
    /** Defaults to reading `result.usage` (AI SDK shape). */
    extractUsage?: (result: T) => UsageLike;
    /** Explicit cost (ASR minutes / TTS chars). When provided, wins over tokens. */
    costOverrideUsd?: number | null;
    call: () => Promise<T>;
};

export type Instrumented<T> = {
    result: T;
    finalize: LlmEventHandle["finalize"];
};

/**
 * Wrap a single LLM call: time it, capture token usage + cost, derive the
 * prompt-version hash, classify any error, and fire-and-forget one `llm_events`
 * doc. Returns the SDK result UNCHANGED plus a `finalize` to patch quality
 * outcomes computed downstream. Telemetry never alters behavior — a thrown call
 * is recorded (success: false) and rethrown verbatim.
 */
export async function runInstrumentedLLM<T>(
    input: InstrumentInput<T>,
): Promise<Instrumented<T>> {
    const start = Date.now();
    try {
        const result = await input.call();
        const latencyMs = Date.now() - start;

        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        try {
            const usage = input.extractUsage
                ? input.extractUsage(result)
                : (result as { usage?: UsageLike }).usage;
            inputTokens = usage?.inputTokens ?? null;
            outputTokens = usage?.outputTokens ?? null;
        } catch {
            // Unexpected usage shape — leave tokens null, keep going.
        }

        const costUsd =
            input.costOverrideUsd !== undefined
                ? input.costOverrideUsd
                : computeTokenCostUsd(input.model, inputTokens, outputTokens);

        const handle = writeLlmEvent(
            buildEvent({
                promptKey: input.promptKey,
                model: input.model,
                provider: input.provider ?? "openai",
                promptParts: input.promptParts,
                refs: input.refs,
                latencyMs,
                success: true,
                inputTokens,
                outputTokens,
                costUsd,
                errorClass: null,
            }),
        );

        return { result, finalize: handle.finalize };
    } catch (err) {
        const latencyMs = Date.now() - start;
        writeLlmEvent(
            buildEvent({
                promptKey: input.promptKey,
                model: input.model,
                provider: input.provider ?? "openai",
                promptParts: input.promptParts,
                refs: input.refs,
                latencyMs,
                success: false,
                inputTokens: null,
                outputTokens: null,
                costUsd: null,
                errorClass: classifyError(err),
            }),
        );
        throw err;
    }
}

/**
 * Record an event for a call whose usage isn't available synchronously — i.e.
 * streaming (feedback-chat), where `usage` resolves in `streamText`'s
 * `onFinish`. Caller times the call and passes the resolved usage.
 */
export function recordLlmEvent(args: {
    promptKey: LlmPromptKey;
    model: string;
    provider?: LlmProvider;
    promptParts?: PromptParts;
    refs?: Partial<LlmEventRefs>;
    latencyMs: number;
    success: boolean;
    inputTokens?: number | null;
    outputTokens?: number | null;
    costOverrideUsd?: number | null;
    errorClass?: LlmErrorClass | null;
    qualityOutcomes?: LlmQualityOutcome[];
}): void {
    const inputTokens = args.inputTokens ?? null;
    const outputTokens = args.outputTokens ?? null;
    const costUsd =
        args.costOverrideUsd !== undefined
            ? args.costOverrideUsd
            : computeTokenCostUsd(args.model, inputTokens, outputTokens);
    writeLlmEvent(
        buildEvent({
            promptKey: args.promptKey,
            model: args.model,
            provider: args.provider ?? "openai",
            promptParts: args.promptParts,
            refs: args.refs,
            latencyMs: args.latencyMs,
            success: args.success,
            inputTokens,
            outputTokens,
            costUsd,
            errorClass: args.errorClass ?? null,
            qualityOutcomes: args.qualityOutcomes,
        }),
    );
}
