/**
 * Parse + compare the desktop agent's inventory headers (`X-Agent-*`), sent on
 * every `GET /api/me` by v3.16.0+. Pure (no Firebase) so `/api/me` can ingest
 * them without any I/O and so this is unit-testable.
 *
 * Robustness over strictness: a malformed header must NEVER fail `/api/me` (the
 * agent's account-state gate), so bad values are silently dropped, not rejected.
 */

const MAX_VERSION_LEN = 64;
const MAX_PLATFORM_LEN = 256;
/** uuid4().hex — 32 lowercase hex chars, no dashes. */
const INSTALL_ID_RE = /^[0-9a-f]{32}$/;

export type AgentInventory = {
    agentVersion?: string;
    agentPlatform?: string;
    agentInstallId?: string;
};

function sanitize(raw: string | null, maxLen: number): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, maxLen);
}

/**
 * Extract `{ agentVersion?, agentPlatform?, agentInstallId? }` from request
 * headers. Only well-formed values are returned; anything missing or malformed
 * is omitted (never throws).
 */
export function parseAgentInventoryHeaders(headers: Headers): AgentInventory {
    const out: AgentInventory = {};

    const version = sanitize(headers.get("x-agent-version"), MAX_VERSION_LEN);
    if (version) out.agentVersion = version;

    const platform = sanitize(headers.get("x-agent-platform"), MAX_PLATFORM_LEN);
    if (platform) out.agentPlatform = platform;

    const installId = headers.get("x-agent-install-id")?.trim().toLowerCase();
    if (installId && INSTALL_ID_RE.test(installId)) {
        out.agentInstallId = installId;
    }

    return out;
}

/**
 * Whether `incoming` carries a value that differs from what's already stored.
 * Drives the write-skip in `/api/me`: a header the agent DIDN'T send never
 * counts as a change (so an omitted header can't clear a stored value), and an
 * identical re-send is a no-op — collapsing steady-state writes to ~once per
 * install + on version upgrades, instead of one write per (hourly/8s) poll.
 */
export function inventoryChanged(
    stored: AgentInventory,
    incoming: AgentInventory,
): boolean {
    return (
        (incoming.agentVersion !== undefined &&
            incoming.agentVersion !== stored.agentVersion) ||
        (incoming.agentPlatform !== undefined &&
            incoming.agentPlatform !== stored.agentPlatform) ||
        (incoming.agentInstallId !== undefined &&
            incoming.agentInstallId !== stored.agentInstallId)
    );
}
