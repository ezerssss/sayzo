"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LearnerModel } from "@/schemas";
import type { UserFocusInsights } from "@/schemas";
import type { UserProfileType } from "@/schemas";

type ProfilePanelProps = {
    profile: UserProfileType | null;
    authRecord: {
        email: string;
        disabled: boolean;
        createdAt: string;
    } | null;
    learnerModel: LearnerModel | null;
    focusInsights: UserFocusInsights | null;
    counts: { sessions: number; captures: number };
};

export function ProfilePanel({
    profile,
    authRecord,
    learnerModel,
    focusInsights,
    counts,
}: ProfilePanelProps) {
    return (
        <section className="rounded-xl border border-border bg-card">
            <header className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Profile</h2>
            </header>
            <div className="grid gap-4 p-4 lg:grid-cols-3">
                <KeyValueGroup
                    title="Account"
                    rows={[
                        ["Email", authRecord?.email ?? "—"],
                        [
                            "Auth created",
                            authRecord?.createdAt
                                ? new Date(authRecord.createdAt).toLocaleString()
                                : "—",
                        ],
                        [
                            "Auth status",
                            authRecord?.disabled ? "disabled" : "active",
                        ],
                        [
                            "Profile created",
                            profile?.createdAt
                                ? new Date(profile.createdAt).toLocaleString()
                                : "—",
                        ],
                        [
                            "Profile updated",
                            profile?.updatedAt
                                ? new Date(profile.updatedAt).toLocaleString()
                                : "—",
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Onboarding"
                    rows={[
                        [
                            "Complete",
                            profile?.onboardingComplete ? "yes" : "no",
                        ],
                        [
                            "Status",
                            profile?.onboardingStatus ?? "—",
                        ],
                        [
                            "Samples saved",
                            String(profile?.onboardingSamples?.length ?? 0),
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Counts"
                    rows={[
                        ["Sessions", String(counts.sessions)],
                        ["Captures", String(counts.captures)],
                        [
                            "Learner model",
                            learnerModel ? "present" : "—",
                        ],
                        [
                            "Focus insights",
                            focusInsights ? "present" : "—",
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Work context"
                    rows={[
                        ["Role", profile?.role ?? "—"],
                        ["Industry", profile?.industry ?? "—"],
                        ["Company", profile?.companyName ?? "—"],
                        [
                            "Employment",
                            profile?.employmentStatus ?? "—",
                        ],
                        [
                            "Wants interview practice",
                            profile?.wantsInterviewPractice ? "yes" : "no",
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Goals"
                    rows={[
                        [
                            "Primary motivation",
                            profile?.motivation ?? "—",
                        ],
                        [
                            "Goals",
                            profile?.goals?.join(", ") || "—",
                        ],
                    ]}
                />
                <KeyValueGroup
                    title="Access"
                    rows={[
                        [
                            "Has full access",
                            profile?.hasFullAccess ? "yes" : "no",
                        ],
                        [
                            "Requested at",
                            profile?.accessRequestedAt
                                ? new Date(
                                      profile.accessRequestedAt,
                                  ).toLocaleString()
                                : "—",
                        ],
                        [
                            "Granted at",
                            profile?.accessGrantedAt
                                ? new Date(
                                      profile.accessGrantedAt,
                                  ).toLocaleString()
                                : "—",
                        ],
                    ]}
                />
            </div>

            {learnerModel &&
            (learnerModel.context.drillNotes ||
                learnerModel.context.realWorldNotes ||
                learnerModel.context.deliveryNotes ||
                learnerModel.strengths.length > 0 ||
                learnerModel.weaknesses.length > 0) ? (
                <CollapsibleNotes learnerModel={learnerModel} />
            ) : null}
        </section>
    );
}

function KeyValueGroup({
    title,
    rows,
}: {
    title: string;
    rows: Array<[string, string]>;
}) {
    return (
        <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </p>
            <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs">
                {rows.map(([k, v]) => (
                    <div
                        key={k}
                        className="flex items-baseline justify-between gap-3"
                    >
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-right text-foreground">{v}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function CollapsibleNotes({ learnerModel }: { learnerModel: LearnerModel }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-t border-border">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/30"
            >
                <ChevronRight
                    className={cn(
                        "size-3 transition-transform",
                        open && "rotate-90",
                    )}
                />
                Internal coaching notes
            </button>
            {open ? (
                <div className="grid gap-3 px-4 pb-4 lg:grid-cols-2">
                    <NoteBlock
                        title="Learner context (drills)"
                        body={learnerModel.context.drillNotes}
                    />
                    <NoteBlock
                        title="Real-world context (captures)"
                        body={learnerModel.context.realWorldNotes}
                    />
                    <NoteBlock
                        title="Delivery notes"
                        body={learnerModel.context.deliveryNotes}
                    />
                    <div className="lg:col-span-2 rounded-lg border border-border/50 bg-background/50 p-3 text-xs">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Skills / habits
                        </p>
                        <p>
                            <span className="text-muted-foreground">
                                Strengths:
                            </span>{" "}
                            {learnerModel.strengths.join(", ") || "—"}
                        </p>
                        <p>
                            <span className="text-muted-foreground">
                                Weaknesses:
                            </span>{" "}
                            {learnerModel.weaknesses.join(", ") || "—"}
                        </p>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function NoteBlock({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-lg border border-border/50 bg-background/50 p-3 text-xs">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </p>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80">
                {body || "—"}
            </pre>
        </div>
    );
}
