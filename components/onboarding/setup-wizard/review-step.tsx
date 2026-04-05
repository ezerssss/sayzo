"use client";

import { ArrowLeft, Loader2, Pencil, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserProfileFieldsFromAI } from "@/services/profile-context-builder";

type EditableFields = {
    role: string;
    companyName: string;
    industry: string;
    goals: string[];
    motivation: string;
    workplaceCommunicationContext: string;
    additionalContext: string;
    employmentStatus: "employed" | "unemployed";
    wantsInterviewPractice: boolean;
};

interface PropsInterface {
    profile: UserProfileFieldsFromAI | null;
    loading: boolean;
    error: string | null;
    onBack: () => void;
    onFinish: (edited: UserProfileFieldsFromAI) => void;
    onRetry: () => void;
}

function FieldRow(props: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    multiline?: boolean;
}) {
    const { label, value, onChange, multiline } = props;
    const [editing, setEditing] = useState(false);

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                    {label}
                </p>
                {!editing ? (
                    <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setEditing(true)}
                    >
                        <Pencil className="size-3" />
                        Edit
                    </button>
                ) : null}
            </div>
            {editing ? (
                multiline ? (
                    <textarea
                        className={cn(
                            "w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm",
                            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                            "outline-none",
                        )}
                        rows={3}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onBlur={() => setEditing(false)}
                        autoFocus
                    />
                ) : (
                    <input
                        type="text"
                        className={cn(
                            "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
                            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                            "outline-none",
                        )}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onBlur={() => setEditing(false)}
                        autoFocus
                    />
                )
            ) : (
                <p className="text-sm leading-relaxed">
                    {value || (
                        <span className="italic text-muted-foreground">
                            Not detected — click edit to add
                        </span>
                    )}
                </p>
            )}
        </div>
    );
}

function GoalsField(props: {
    goals: string[];
    onChange: (goals: string[]) => void;
}) {
    const { goals, onChange } = props;
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(goals.join("\n"));

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                    Goals
                </p>
                {!editing ? (
                    <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                            setText(goals.join("\n"));
                            setEditing(true);
                        }}
                    >
                        <Pencil className="size-3" />
                        Edit
                    </button>
                ) : null}
            </div>
            {editing ? (
                <textarea
                    className={cn(
                        "w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm",
                        "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                        "outline-none",
                    )}
                    rows={4}
                    placeholder="One goal per line"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={() => {
                        const parsed = text
                            .split("\n")
                            .map((s) => s.trim())
                            .filter((s) => s.length > 0);
                        onChange(parsed);
                        setEditing(false);
                    }}
                    autoFocus
                />
            ) : goals.length > 0 ? (
                <ul className="list-inside list-disc space-y-0.5 text-sm">
                    {goals.map((g) => (
                        <li key={g}>{g}</li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm italic text-muted-foreground">
                    Not detected — click edit to add
                </p>
            )}
        </div>
    );
}

export function ReviewStep(props: Readonly<PropsInterface>) {
    const { profile, loading, error, onBack, onFinish, onRetry } = props;

    const [fields, setFields] = useState<EditableFields | null>(null);

    // Sync profile into editable fields when it arrives
    const resolvedFields: EditableFields | null =
        fields ??
        (profile
            ? {
                  role: profile.role,
                  companyName: profile.companyName,
                  industry: profile.industry,
                  goals: [...profile.goals],
                  motivation: profile.motivation,
                  workplaceCommunicationContext:
                      profile.workplaceCommunicationContext,
                  additionalContext: profile.additionalContext,
                  employmentStatus: profile.employmentStatus,
                  wantsInterviewPractice: profile.wantsInterviewPractice,
              }
            : null);

    const updateField = useCallback(
        <K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
            setFields((prev) => {
                const base = prev ?? {
                    role: profile?.role ?? "",
                    companyName: profile?.companyName ?? "",
                    industry: profile?.industry ?? "",
                    goals: [...(profile?.goals ?? [])],
                    motivation: profile?.motivation ?? "",
                    workplaceCommunicationContext:
                        profile?.workplaceCommunicationContext ?? "",
                    additionalContext: profile?.additionalContext ?? "",
                    employmentStatus: profile?.employmentStatus ?? "employed",
                    wantsInterviewPractice:
                        profile?.wantsInterviewPractice ?? false,
                };
                return { ...base, [key]: value };
            });
        },
        [profile],
    );

    if (loading) {
        return (
            <div className="space-y-5">
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold tracking-tight">
                        Building your profile
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Extracting your details from what you shared…
                    </p>
                </div>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="size-6 animate-spin text-primary" />
                </div>
            </div>
        );
    }

    if (error || !resolvedFields) {
        return (
            <div className="space-y-5">
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold tracking-tight">
                        Something went wrong
                    </h2>
                    <p className="text-sm text-destructive">
                        {error ?? "Could not extract your profile."}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={onBack}
                    >
                        <ArrowLeft />
                        Back
                    </Button>
                    <Button
                        type="button"
                        className="flex-1"
                        onClick={onRetry}
                    >
                        Try again
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">
                    Does this look right?
                </h2>
                <p className="text-sm text-muted-foreground">
                    We built this from your drills. Edit anything that&apos;s off.
                </p>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <FieldRow
                    label="Role"
                    value={resolvedFields.role}
                    onChange={(v) => updateField("role", v)}
                />
                <FieldRow
                    label="Company"
                    value={resolvedFields.companyName}
                    onChange={(v) => updateField("companyName", v)}
                />
                <FieldRow
                    label="Industry"
                    value={resolvedFields.industry}
                    onChange={(v) => updateField("industry", v)}
                />
                <GoalsField
                    goals={resolvedFields.goals}
                    onChange={(v) => updateField("goals", v)}
                />
                <FieldRow
                    label="Motivation"
                    value={resolvedFields.motivation}
                    onChange={(v) => updateField("motivation", v)}
                    multiline
                />
                <FieldRow
                    label="Communication context"
                    value={resolvedFields.workplaceCommunicationContext}
                    onChange={(v) =>
                        updateField("workplaceCommunicationContext", v)
                    }
                    multiline
                />
                <FieldRow
                    label="Challenges & pain points"
                    value={resolvedFields.additionalContext}
                    onChange={(v) => updateField("additionalContext", v)}
                    multiline
                />

                <div className="flex items-center gap-4">
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                            Employment
                        </p>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant={
                                    resolvedFields.employmentStatus ===
                                    "employed"
                                        ? "default"
                                        : "outline"
                                }
                                onClick={() =>
                                    updateField("employmentStatus", "employed")
                                }
                            >
                                Employed
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={
                                    resolvedFields.employmentStatus ===
                                    "unemployed"
                                        ? "default"
                                        : "outline"
                                }
                                onClick={() => {
                                    updateField(
                                        "employmentStatus",
                                        "unemployed",
                                    );
                                    updateField(
                                        "wantsInterviewPractice",
                                        true,
                                    );
                                }}
                            >
                                Job seeking
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                            Interview practice
                        </p>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant={
                                    resolvedFields.wantsInterviewPractice
                                        ? "default"
                                        : "outline"
                                }
                                onClick={() =>
                                    updateField("wantsInterviewPractice", true)
                                }
                            >
                                Yes
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={
                                    !resolvedFields.wantsInterviewPractice
                                        ? "default"
                                        : "outline"
                                }
                                disabled={
                                    resolvedFields.employmentStatus ===
                                    "unemployed"
                                }
                                onClick={() =>
                                    updateField(
                                        "wantsInterviewPractice",
                                        false,
                                    )
                                }
                            >
                                No
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={onBack}
                >
                    <ArrowLeft />
                    Back
                </Button>
                <Button
                    type="button"
                    className="flex-1"
                    onClick={() =>
                        onFinish({
                            ...resolvedFields,
                            companyDescription:
                                profile?.companyDescription ?? "",
                        })
                    }
                >
                    Looks good
                    <Sparkles />
                </Button>
            </div>
        </div>
    );
}
