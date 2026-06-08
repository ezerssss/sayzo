export type DrillState = "idle" | "recording" | "analyzing" | "complete";

export type SessionHomeProps = {
    uid: string;
    authError?: string | null;
    /** The replay session to load and play (a capture practice attempt). */
    sessionId: string;
};
