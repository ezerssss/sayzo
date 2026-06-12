"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import {
    checkCorrectionGuards,
    tokenizeLine,
} from "@/lib/captures/corrections";
import type { CaptureTranscriptLine, TranscriptCorrection } from "@/schemas";
import {
    MAX_CORRECTION_REPLACEMENT_CHARS,
    MAX_CORRECTIONS_PER_CAPTURE,
} from "@/schemas";

type SubmitResult =
    | { index: number; accepted: true; isVocabularyTerm: boolean }
    | { index: number; accepted: false; reason: string };

type Props = {
    captureId: string;
    transcript: CaptureTranscriptLine[];
    transcriptIdx: number;
    corrections: TranscriptCorrection[];
    /** Char offset (into the raw line text) of the word the user clicked. */
    clickedStart: number;
    onClose: () => void;
};

/**
 * Minimal inline "fix a misheard word" editor, rendered directly under the
 * transcript line: the clicked word, an input, Fix it. One word per fix —
 * the API supports multi-word spans, but the UI deliberately keeps the
 * single-word mental model. Guards mirror the server via
 * lib/captures/corrections.ts.
 */
export function TranscriptCorrectionEditor(props: Readonly<Props>) {
    const {
        captureId,
        transcript,
        transcriptIdx,
        corrections,
        clickedStart,
        onClose,
    } = props;

    const line = transcript[transcriptIdx];
    const token = useMemo(
        () =>
            tokenizeLine(line?.text ?? "").find(
                (t) => t.start === clickedStart,
            ) ?? null,
        [line?.text, clickedStart],
    );

    const [replacement, setReplacement] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<string | null>(null);

    const submit = async () => {
        if (!token || pending) return;
        const candidate = {
            transcriptIdx,
            charStart: token.start,
            charEnd: token.end,
            original: token.text,
            replacement: replacement.trim(),
        };
        const guardRejection = checkCorrectionGuards(
            candidate,
            transcript,
            corrections,
        );
        if (guardRejection) {
            setError(guardRejection.message);
            return;
        }

        setPending(true);
        setError(null);
        try {
            const { results } = await api
                .post(`/api/captures/${captureId}/corrections`, {
                    json: { corrections: [candidate] },
                    timeout: 30_000,
                })
                .json<{ results: SubmitResult[] }>();
            const result = results[0];
            if (!result) {
                setError(
                    "Sayzo couldn't check this fix just now. Please try again.",
                );
                return;
            }
            if (!result.accepted) {
                setError(result.reason);
                return;
            }
            // The capture listener updates the line itself; show the
            // vocabulary note when there is one, otherwise just close.
            if (result.isVocabularyTerm) {
                setConfirmation(
                    `Fixed. Sayzo will listen for "${candidate.replacement}" in your future conversations.`,
                );
            } else {
                onClose();
            }
        } catch {
            setError(
                "Sayzo couldn't check this fix just now. Please try again.",
            );
        } finally {
            setPending(false);
        }
    };

    if (!line || !token) return null;

    if (confirmation) {
        return (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-3">
                <p className="text-xs leading-relaxed text-emerald-700">
                    {confirmation}
                </p>
                <Button size="sm" variant="ghost" onClick={onClose}>
                    Done
                </Button>
            </div>
        );
    }

    return (
        <div className="mt-2 space-y-2 rounded-xl border border-border/60 bg-background p-3">
            <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {token.text}
                </span>
                <input
                    type="text"
                    value={replacement}
                    maxLength={MAX_CORRECTION_REPLACEMENT_CHARS}
                    onChange={(e) => {
                        setReplacement(e.target.value);
                        setError(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void submit();
                        if (e.key === "Escape") onClose();
                    }}
                    placeholder="What was really said"
                    autoFocus
                    className="min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground/40"
                />
                <Button
                    size="sm"
                    onClick={submit}
                    disabled={!replacement.trim() || pending}
                >
                    {pending ? "Checking…" : "Fix it"}
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose}>
                    Cancel
                </Button>
            </div>

            {error && (
                <p role="alert" className="text-xs leading-relaxed text-red-600">
                    {error}
                </p>
            )}

            <p className="text-[11px] text-muted-foreground">
                Fixes what Sayzo misheard — it won&apos;t tidy grammar or
                remove ums and uhs. {corrections.length} of{" "}
                {MAX_CORRECTIONS_PER_CAPTURE} fixes used.
            </p>
        </div>
    );
}
