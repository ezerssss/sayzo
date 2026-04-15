export type DrillState = "idle" | "recording" | "analyzing" | "complete";

export type SessionHomeProps = {
    uid: string;
    userLabel: string;
    onSignOut: () => void;
    authError?: string | null;
    /** When set, loads this specific session instead of the latest. Used for conversation practice. */
    sessionId?: string;
};

export type PreNewDrillReflectionState = {
    priorSessionId: string;
    scenarioTitle: string;
};
