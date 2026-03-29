"use client";

interface PropsInterface {
    transcript: string;
    onSeekToSecond?: (seconds: number) => void;
    /** Defaults to "Transcript" (drill response). Use for skip reasons etc. */
    heading?: string;
}

export function TranscriptPanel(props: Readonly<PropsInterface>) {
    const { transcript, onSeekToSecond, heading = "Transcript" } = props;

    const lines = transcript.split("\n");

    const parseTimestamp = (value: string): number | null => {
        const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!m) return null;
        if (m[3] != null) {
            const hh = Number(m[1]);
            const mm = Number(m[2]);
            const ss = Number(m[3]);
            return hh * 3600 + mm * 60 + ss;
        }
        const mm = Number(m[1]);
        const ss = Number(m[2]);
        return mm * 60 + ss;
    };

    return (
        <div className="rounded-xl border border-border/70 p-4">
            <p className="text-sm font-medium">{heading}</p>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {lines.map((line, idx) => {
                    const match = line.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);
                    if (!match) {
                        return <p key={`${idx}-${line}`}>{line}</p>;
                    }
                    const stamp = match[1] ?? "";
                    const seconds = parseTimestamp(stamp);
                    if (seconds == null || !onSeekToSecond) {
                        return <p key={`${idx}-${line}`}>{line}</p>;
                    }
                    return (
                        <p key={`${idx}-${line}`}>
                            <button
                                type="button"
                                className="mr-1 rounded-md bg-muted px-1.5 py-0.5 text-foreground underline decoration-dotted underline-offset-2 hover:bg-muted/80"
                                onClick={() => onSeekToSecond(seconds)}
                            >
                                [{stamp}]
                            </button>
                            {line.replace(match[0], "").trim()}
                        </p>
                    );
                })}
            </div>
        </div>
    );
}

