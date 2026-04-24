export type SupportCategory = "bug" | "feature" | "question" | "other";

export type SupportReportStatus = "open" | "triaged" | "closed";

export interface SupportReportType {
    uid: string | null;
    email: string;
    category: SupportCategory;
    subject: string;
    message: string;
    diagnostics?: string;
    agentVersion?: string;
    agentOs?: string;
    clientUid?: string;
    authedUidMatch: boolean | null;
    ip?: string;
    userAgent?: string;
    createdAt: string;
    status: SupportReportStatus;
}
