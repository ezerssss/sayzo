"use client";

import { FileText, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
    now: ReactNode;
    improved: ReactNode;
    /** Public prop maps to the internal Radix value "rewrites". */
    defaultValue?: "now" | "improved";
};

/**
 * Shared two-tab shell for post-feedback UIs ("Coaching" / "Improved
 * Version"). Used by both the drill page (SessionFeedbackSection) and the
 * capture detail page so the two surfaces share one structure. Each surface
 * fills `now` and `improved` with its own content; "Discuss this feedback"
 * lives inside the tab content, after the feedback and before the
 * transcript. (The conversation page's meeting summary lives in the hero
 * above the tabs, not in a tab — coaching stays the landing view.)
 */
export function FeedbackTabs({
    now,
    improved,
    defaultValue = "now",
}: Readonly<Props>) {
    const internalDefault = defaultValue === "improved" ? "rewrites" : "now";
    return (
        <Tabs defaultValue={internalDefault}>
            <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                <TabsTrigger value="now" className="shrink-0">
                    <FileText className="size-3.5" />
                    Coaching
                </TabsTrigger>
                <TabsTrigger value="rewrites" className="shrink-0">
                    <Sparkles className="size-3.5" />
                    Improved Version
                </TabsTrigger>
            </TabsList>

            <TabsContent value="now" className="mt-3 space-y-4">
                {now}
            </TabsContent>

            <TabsContent value="rewrites" className="mt-3 space-y-4">
                {improved}
            </TabsContent>
        </Tabs>
    );
}
