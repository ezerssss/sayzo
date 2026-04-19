"use client";

import type { Analytics } from "firebase/analytics";

import { app } from "@/lib/firebase/client";

import type { AnalyticsEventName, AnalyticsEventParams } from "./events";

type MaybeAnalytics = Analytics | null;

let analyticsPromise: Promise<MaybeAnalytics> | null = null;

function measurementIdConfigured(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID &&
            process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID.trim() !== "",
    );
}

function debugMode(): boolean {
    return process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true";
}

function ensureAnalytics(): Promise<MaybeAnalytics> {
    if (typeof window === "undefined") return Promise.resolve(null);
    if (!measurementIdConfigured()) return Promise.resolve(null);
    if (analyticsPromise) return analyticsPromise;

    analyticsPromise = (async () => {
        const { isSupported, getAnalytics } = await import(
            "firebase/analytics"
        );
        const supported = await isSupported();
        if (!supported) return null;
        return getAnalytics(app);
    })().catch((err) => {
        console.warn("[analytics] init failed", err);
        return null;
    });

    return analyticsPromise;
}

/**
 * Warm up analytics on app boot. Safe to call multiple times.
 * Invoked from instrumentation-client.ts; no-op in SSR.
 */
export function initAnalytics(): void {
    void ensureAnalytics();
}

export function track<E extends AnalyticsEventName>(
    event: E,
    params: AnalyticsEventParams[E],
): void {
    void (async () => {
        try {
            const analytics = await ensureAnalytics();
            if (!analytics) return;
            const { logEvent } = await import("firebase/analytics");
            const payload = debugMode()
                ? { ...params, debug_mode: true }
                : params;
            logEvent(
                analytics,
                event as string,
                payload as Record<string, unknown>,
            );
        } catch (err) {
            console.warn("[analytics] track failed", event, err);
        }
    })();
}

export function identifyUser(uid: string | null): void {
    void (async () => {
        try {
            const analytics = await ensureAnalytics();
            if (!analytics) return;
            const { setUserId } = await import("firebase/analytics");
            setUserId(analytics, uid);
        } catch (err) {
            console.warn("[analytics] identifyUser failed", err);
        }
    })();
}

export function setUserProps(
    props: Record<string, string | number | boolean | null | undefined>,
): void {
    void (async () => {
        try {
            const analytics = await ensureAnalytics();
            if (!analytics) return;
            const { setUserProperties } = await import("firebase/analytics");
            const clean: Record<string, string> = {};
            for (const [key, value] of Object.entries(props)) {
                if (value === undefined || value === null) continue;
                clean[key] = String(value);
            }
            setUserProperties(analytics, clean);
        } catch (err) {
            console.warn("[analytics] setUserProps failed", err);
        }
    })();
}

export function trackPageView(
    pagePath: string,
    navigationType: AnalyticsEventParams["page_view"]["navigation_type"],
): void {
    track("page_view", { page_path: pagePath, navigation_type: navigationType });
}
