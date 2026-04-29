"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useAuthUser } from "@/hooks/use-auth-user";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type { CaptureType } from "@/types/captures";
import type { UserFocusInsights } from "@/types/focus-insights";
import type { SessionType } from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

import { AdminToggle } from "./_components/admin-toggle";
import { CapturesPanel } from "./_components/captures-panel";
import { CreditsEditor } from "./_components/credits-editor";
import { DangerZone } from "./_components/danger-zone";
import { ProfilePanel } from "./_components/profile-panel";
import { SessionsPanel } from "./_components/sessions-panel";

type UserDetailResponse = {
    uid: string;
    authRecord: {
        email: string;
        disabled: boolean;
        createdAt: string;
    } | null;
    profile: UserProfileType | null;
    skillMemory: SkillMemoryType | null;
    focusInsights: UserFocusInsights | null;
    counts: { sessions: number; captures: number };
};

export default function AdminUserDetailPage() {
    const params = useParams<{ uid: string }>();
    const uid = params?.uid ?? "";
    const router = useRouter();
    const { user: viewer } = useAuthUser();

    const [data, setData] = useState<UserDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [sessions, setSessions] = useState<SessionType[]>([]);
    const [captures, setCaptures] = useState<CaptureType[]>([]);

    const refresh = useCallback(async () => {
        if (!uid) return;
        setError(null);
        try {
            const detail = await api
                .get(`/api/admin/users/${uid}`, { timeout: 30_000 })
                .json<UserDetailResponse>();
            setData(detail);
        } catch (err) {
            setError(await getKyErrorMessage(err, "Could not load user."));
        }
    }, [uid]);

    useEffect(() => {
        let cancelled = false;
        async function run() {
            if (!uid) return;
            setLoading(true);
            try {
                const [detail, sessionsRes, capturesRes] = await Promise.all([
                    api
                        .get(`/api/admin/users/${uid}`, { timeout: 30_000 })
                        .json<UserDetailResponse>(),
                    api
                        .get(`/api/admin/users/${uid}/sessions?limit=25`, {
                            timeout: 30_000,
                        })
                        .json<{
                            sessions: SessionType[];
                            nextCursor: string | null;
                        }>(),
                    api
                        .get(`/api/admin/users/${uid}/captures?limit=25`, {
                            timeout: 30_000,
                        })
                        .json<{
                            captures: CaptureType[];
                            nextCursor: string | null;
                        }>(),
                ]);
                if (cancelled) return;
                setData(detail);
                setSessions(sessionsRes.sessions);
                setCaptures(capturesRes.captures);
            } catch (err) {
                if (cancelled) return;
                setError(await getKyErrorMessage(err, "Could not load user."));
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void run();
        return () => {
            cancelled = true;
        };
    }, [uid]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading user&hellip;
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex flex-col gap-3">
                <BackLink />
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="flex flex-col gap-3">
                <BackLink />
                <p className="text-sm text-muted-foreground">User not found.</p>
            </div>
        );
    }

    const isSelf = viewer?.uid === uid;

    return (
        <div className="flex flex-1 flex-col gap-6">
            <BackLink />
            <header className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    User
                </p>
                <h1 className="text-xl font-semibold tracking-tight">
                    {data.authRecord?.email ?? "(no email)"}
                </h1>
                <code className="text-[11px] text-muted-foreground">{uid}</code>
                {data.authRecord?.disabled ? (
                    <span className="mt-1 inline-flex w-max items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                        Auth disabled
                    </span>
                ) : null}
            </header>

            <div className="grid gap-4 lg:grid-cols-2">
                <CreditsEditor
                    uid={uid}
                    profile={data.profile}
                    onSaved={refresh}
                />
                <AdminToggle
                    uid={uid}
                    profile={data.profile}
                    isSelf={isSelf}
                    onSaved={refresh}
                />
            </div>

            <ProfilePanel
                profile={data.profile}
                authRecord={data.authRecord}
                skillMemory={data.skillMemory}
                focusInsights={data.focusInsights}
                counts={data.counts}
            />

            <SessionsPanel sessions={sessions} />
            <CapturesPanel captures={captures} />

            <DangerZone
                uid={uid}
                email={data.authRecord?.email ?? ""}
                isSelf={isSelf}
                onDeleted={() => router.push("/admin/users")}
            />
        </div>
    );
}

function BackLink() {
    return (
        <div>
            <Link
                href="/admin/users"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="size-3" />
                All users
            </Link>
        </div>
    );
}
