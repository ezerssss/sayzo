import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { tryAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { SupportReportType } from "@/types/support";

export const runtime = "nodejs";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const payloadSchema = z.object({
    category: z.enum(["bug", "feature", "question", "other"]),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(5000),
    email: z.string().trim().email().max(320),
    diagnostics: z.string().trim().max(100_000).optional(),
    agentVersion: z.string().trim().max(50).optional(),
    agentOs: z.string().trim().max(32).optional(),
    clientUid: z.string().trim().max(128).optional(),
});

function firstForwardedIp(header: string | null): string | null {
    if (!header) return null;
    const first = header.split(",")[0]?.trim();
    return first && first.length > 0 ? first : null;
}

function hashKey(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function POST(request: NextRequest) {
    let rawPayload: unknown;
    try {
        rawPayload = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const parsed = payloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return NextResponse.json(
            {
                error: firstIssue?.message
                    ? `Invalid submission: ${firstIssue.message}`
                    : "Invalid submission.",
            },
            { status: 400 },
        );
    }
    const body = parsed.data;

    const auth = await tryAuth(request);
    const ip =
        firstForwardedIp(request.headers.get("x-forwarded-for")) ??
        firstForwardedIp(request.headers.get("x-real-ip"));
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const db = getAdminFirestore();

    const rateKey = hashKey(ip ?? body.email.toLowerCase());
    const rateRef = db
        .collection(FirestoreCollections.supportReportsRate.path)
        .doc(rateKey);

    try {
        const limited = await db.runTransaction(async (tx) => {
            const snap = await tx.get(rateRef);
            const now = Date.now();
            const data = snap.exists
                ? (snap.data() as { count?: number; windowStartMs?: number })
                : null;
            const windowStartMs =
                data?.windowStartMs && now - data.windowStartMs < RATE_LIMIT_WINDOW_MS
                    ? data.windowStartMs
                    : now;
            const count =
                data?.count && windowStartMs === data.windowStartMs
                    ? data.count + 1
                    : 1;
            if (count > RATE_LIMIT_MAX) {
                return true;
            }
            tx.set(rateRef, { count, windowStartMs }, { merge: false });
            return false;
        });

        if (limited) {
            return NextResponse.json(
                {
                    error:
                        "Too many reports from this network recently. Please wait a bit and try again, or email team@sayzo.app.",
                },
                { status: 429 },
            );
        }

        const doc: SupportReportType = {
            uid: auth?.uid ?? null,
            email: body.email.toLowerCase(),
            category: body.category,
            subject: body.subject,
            message: body.message,
            authedUidMatch: auth
                ? body.clientUid
                    ? auth.uid === body.clientUid
                    : null
                : null,
            createdAt: new Date().toISOString(),
            status: "open",
        };
        if (body.diagnostics) doc.diagnostics = body.diagnostics;
        if (body.agentVersion) doc.agentVersion = body.agentVersion;
        if (body.agentOs) doc.agentOs = body.agentOs;
        if (body.clientUid) doc.clientUid = body.clientUid;
        if (ip) doc.ip = ip;
        if (userAgent) doc.userAgent = userAgent;

        await db
            .collection(FirestoreCollections.supportReports.path)
            .add(doc);

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[api/support-reports] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to submit your report.",
            },
            { status: 500 },
        );
    }
}
