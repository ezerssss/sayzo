import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthSessionData {
    codeChallenge: string;
    codeChallengeMethod: "S256";
    redirectUri: string;
    state: string;
    createdAt: number;
    expiresAt: number;
}

export interface AuthCodeData {
    sessionId: string;
    firebaseUid: string;
    email: string;
    redirectUri: string;
    codeChallenge: string;
    createdAt: number;
    expiresAt: number;
}

export interface RefreshTokenData {
    firebaseUid: string;
    email: string;
    createdAt: number;
    expiresAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutesFromNow(minutes: number): number {
    return Date.now() + minutes * 60_000;
}

function daysFromNow(days: number): number {
    return Date.now() + days * 86_400_000;
}

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// Auth Sessions (PKCE session started by /authorize)
// ---------------------------------------------------------------------------

export async function createAuthSession(params: {
    codeChallenge: string;
    codeChallengeMethod: "S256";
    redirectUri: string;
    state: string;
}): Promise<string> {
    const db = getAdminFirestore();
    const sessionId = randomUUID();
    const data: AuthSessionData = {
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: params.codeChallengeMethod,
        redirectUri: params.redirectUri,
        state: params.state,
        createdAt: Date.now(),
        expiresAt: minutesFromNow(5),
    };
    await db
        .collection(FirestoreCollections.authSessions.path)
        .doc(sessionId)
        .set(data);
    return sessionId;
}

export async function getAuthSession(
    sessionId: string,
): Promise<AuthSessionData | null> {
    const db = getAdminFirestore();
    const snap = await db
        .collection(FirestoreCollections.authSessions.path)
        .doc(sessionId)
        .get();
    if (!snap.exists) return null;
    return snap.data() as AuthSessionData;
}

export async function deleteAuthSession(sessionId: string): Promise<void> {
    const db = getAdminFirestore();
    await db
        .collection(FirestoreCollections.authSessions.path)
        .doc(sessionId)
        .delete();
}

// ---------------------------------------------------------------------------
// Auth Codes (single-use authorization codes)
// ---------------------------------------------------------------------------

export async function createAuthCode(params: {
    sessionId: string;
    firebaseUid: string;
    email: string;
    redirectUri: string;
    codeChallenge: string;
}): Promise<string> {
    const db = getAdminFirestore();
    const code = randomUUID();
    const data: AuthCodeData = {
        sessionId: params.sessionId,
        firebaseUid: params.firebaseUid,
        email: params.email,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        createdAt: Date.now(),
        expiresAt: minutesFromNow(5),
    };
    await db
        .collection(FirestoreCollections.authCodes.path)
        .doc(code)
        .set(data);
    return code;
}

export async function getAuthCode(code: string): Promise<AuthCodeData | null> {
    const db = getAdminFirestore();
    const snap = await db
        .collection(FirestoreCollections.authCodes.path)
        .doc(code)
        .get();
    if (!snap.exists) return null;
    return snap.data() as AuthCodeData;
}

export async function deleteAuthCode(code: string): Promise<void> {
    const db = getAdminFirestore();
    await db
        .collection(FirestoreCollections.authCodes.path)
        .doc(code)
        .delete();
}

// ---------------------------------------------------------------------------
// Refresh Tokens (stored by hash for security)
// ---------------------------------------------------------------------------

export async function createRefreshToken(
    firebaseUid: string,
    email: string,
): Promise<string> {
    const db = getAdminFirestore();
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const data: RefreshTokenData = {
        firebaseUid,
        email,
        createdAt: Date.now(),
        expiresAt: daysFromNow(90),
    };
    await db
        .collection(FirestoreCollections.refreshTokens.path)
        .doc(tokenHash)
        .set(data);
    return rawToken;
}

export async function getRefreshToken(
    rawToken: string,
): Promise<RefreshTokenData | null> {
    const db = getAdminFirestore();
    const tokenHash = hashToken(rawToken);
    const snap = await db
        .collection(FirestoreCollections.refreshTokens.path)
        .doc(tokenHash)
        .get();
    if (!snap.exists) return null;
    return snap.data() as RefreshTokenData;
}

export async function deleteRefreshToken(rawToken: string): Promise<void> {
    const db = getAdminFirestore();
    const tokenHash = hashToken(rawToken);
    await db
        .collection(FirestoreCollections.refreshTokens.path)
        .doc(tokenHash)
        .delete();
}
