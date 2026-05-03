// Single source of truth for analytics events.
// GA4 conventions: snake_case, ≤40 chars, param values ≤100 chars.
// Add a new event by extending AnalyticsEventParams below — track() picks it up automatically.

export type FeedbackChatSource = "session" | "capture";
export type DesktopOS = "windows" | "macos";
export type CreditFeature = "drill" | "capture" | "replay";
export type LengthBucket = "short" | "medium" | "long";
export type SignInSource = "login_page" | "install_page" | "nav" | "unknown";
export type InstallPanelSource = "install_page" | "landing_panel";
export type SupportCategoryEventValue = "bug" | "feature" | "question" | "other";

export type AnalyticsEventParams = {
    // Page / navigation (fired by instrumentation-client.ts)
    page_view: {
        page_path: string;
        navigation_type: "push" | "replace" | "traverse" | "initial";
    };

    // Auth
    sign_in_clicked: { source: SignInSource };
    sign_in_success: { new_user: boolean };
    sign_in_failed: {
        code: string;
        stage: "popup" | "callback";
    };
    sign_out: Record<string, never>;

    // Desktop install funnel
    install_os_switched: { from: DesktopOS; to: DesktopOS };
    desktop_download_clicked: {
        os: DesktopOS;
        source: InstallPanelSource;
    };
    install_terminal_copied: { os: DesktopOS };
    desktop_first_capture_seen: { time_since_download_min: number | null };

    // Onboarding
    onboarding_started: Record<string, never>;
    onboarding_drill_submitted: { drill_index: number };
    onboarding_completed: {
        drill_count: number;
        total_duration_sec: number | null;
    };

    // Core engagement — drills
    drill_started: {
        skill_target: string | null;
        category: string | null;
    };
    drill_submitted: { duration_sec: number | null };
    drill_completed: {
        completion_status: "passed" | "needs_retry" | "skipped" | "pending";
    };
    drill_abandoned: { stage: string };
    drill_voluntary_retry: Record<string, never>;

    // Captures / replays
    capture_opened: { source: string };
    scenario_replay_started: Record<string, never>;

    // Feedback chat
    feedback_chat_opened: { source: FeedbackChatSource };
    feedback_chat_message_sent: {
        source: FeedbackChatSource;
        length_bucket: LengthBucket;
        via: "voice" | "text";
    };

    // TTS
    tts_play_clicked: { context: "drill_prompt" | "feedback" };
    tts_response_received: {
        cache_hit: boolean;
        text_length_bucket: LengthBucket;
    };

    // Credits / conversion
    credit_consumed: {
        feature: CreditFeature;
        // Omitted when the call site doesn't have credit state handy — the
        // credits_used user property (synced by AnalyticsUserSync) is
        // authoritative for segmentation.
        credits_used_after?: number;
        credits_remaining?: number | null;
    };
    credit_warning_shown: { credits_remaining: number };
    credit_limit_reached: { feature: CreditFeature };
    upgrade_dialog_opened: { trigger: "banner_zero" | "guard" | "limit_hit" };
    full_access_requested: Record<string, never>;

    // Mobile traffic
    mobile_visitor_detected: { page: "landing" | "install_page" | "app" };
    install_link_sent_to_self: {
        method: "share" | "copy";
        source: "banner" | "install_page";
    };
    mobile_banner_dismissed: { page: "landing" | "app" };

    // Errors
    api_error: {
        route: string;
        status: number;
        code?: string;
    };
    client_error: { message_bucket: string };

    // Support
    support_submitted: {
        category: SupportCategoryEventValue;
        has_agent_meta: boolean;
        signed_in: boolean;
    };
};

export type AnalyticsEventName = keyof AnalyticsEventParams;

export function bucketLength(chars: number): LengthBucket {
    if (chars < 80) return "short";
    if (chars < 400) return "medium";
    return "long";
}
