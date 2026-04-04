"use client";

import { MarkdownBlock } from "@/components/session/markdown-block";

interface NativeSpeakerPanelProps {
    content: string;
}

export function NativeSpeakerPanel({ content }: NativeSpeakerPanelProps) {
    return (
        <div className="rounded-xl border border-border/70 p-4">
            <p className="text-sm font-medium">Improved Version</p>
            <p className="mt-1 text-xs text-muted-foreground">
                Here&apos;s how a confident, fluent speaker would deliver the
                same message. Notes highlight what&apos;s different and why.
            </p>

            <div className="mt-4">
                <MarkdownBlock markdown={content} />
            </div>
        </div>
    );
}
