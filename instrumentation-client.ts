// Runs after the HTML loads but before React hydrates. Sets up analytics and
// a global error listener. Route-change page_view events are fired from
// onRouterTransitionStart below — Firebase Analytics does not auto-collect
// page_view in SPA / App Router navigation without this hook.

import { initAnalytics, track, trackPageView } from "@/lib/analytics/client";

try {
    initAnalytics();
    if (typeof window !== "undefined") {
        // Fire the initial page_view once. Subsequent navigations are covered
        // by onRouterTransitionStart.
        trackPageView(window.location.pathname, "initial");

        window.addEventListener("error", (event) => {
            try {
                const raw = event.error?.message || event.message || "unknown";
                // Trim to keep under GA4's 100-char param limit and avoid
                // accidentally exfiltrating user content in error messages.
                const trimmed = String(raw).slice(0, 80);
                track("client_error", { message_bucket: trimmed });
            } catch {
                // swallow — analytics must never throw in the error handler
            }
        });
    }
} catch (err) {
    console.warn("[instrumentation-client] init failed", err);
}

export function onRouterTransitionStart(
    url: string,
    navigationType: "push" | "replace" | "traverse",
) {
    try {
        // `url` is the pathname + search; strip the query string since
        // GA4 already gets query params from its own collection.
        const path = url.split("?")[0] ?? url;
        trackPageView(path, navigationType);
    } catch {
        // swallow
    }
}
