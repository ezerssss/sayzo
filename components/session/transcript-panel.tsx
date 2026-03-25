"use client";

interface PropsInterface {
    transcript: string;
}

export function TranscriptPanel(props: Readonly<PropsInterface>) {
    const { transcript } = props;

    return (
        <div className="rounded-xl border border-border/70 p-4">
            <p className="text-sm font-medium">Transcript</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {transcript}
            </pre>
        </div>
    );
}

