import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { diagnosticMetaSchema } from "@/schemas/diagnostics/diagnostic-log";
import {
    inventoryChanged,
    parseAgentInventoryHeaders,
} from "@/lib/diagnostics/inventory";
import {
    DiagnosticIngestError,
    diagnosticBlobKey,
    diagnosticDocId,
    gunzipLogPart,
    normalizeCapturedAt,
    parseMeta,
    plaintextLogName,
    retentionCutoffIso,
    retentionDays,
} from "@/lib/diagnostics/ingest";

const VALID_INSTALL_ID = "0123456789abcdef0123456789abcdef";

function headers(init: Record<string, string>): Headers {
    return new Headers(init);
}

describe("parseAgentInventoryHeaders", () => {
    it("extracts all three well-formed values", () => {
        const inv = parseAgentInventoryHeaders(
            headers({
                "X-Agent-Version": "3.16.0",
                "X-Agent-Platform": "win32;Windows-10-10.0.19045-SP0;py3.12.10",
                "X-Agent-Install-Id": VALID_INSTALL_ID,
            }),
        );
        expect(inv).toEqual({
            agentVersion: "3.16.0",
            agentPlatform: "win32;Windows-10-10.0.19045-SP0;py3.12.10",
            agentInstallId: VALID_INSTALL_ID,
        });
    });

    it("drops a malformed install id but keeps the rest", () => {
        const inv = parseAgentInventoryHeaders(
            headers({
                "X-Agent-Version": "3.16.0",
                "X-Agent-Install-Id": "not-hex",
            }),
        );
        expect(inv.agentInstallId).toBeUndefined();
        expect(inv.agentVersion).toBe("3.16.0");
    });

    it("lowercases a hex install id", () => {
        const inv = parseAgentInventoryHeaders(
            headers({ "X-Agent-Install-Id": VALID_INSTALL_ID.toUpperCase() }),
        );
        expect(inv.agentInstallId).toBe(VALID_INSTALL_ID);
    });

    it("returns an empty object when no agent headers are present", () => {
        expect(parseAgentInventoryHeaders(headers({}))).toEqual({});
    });

    it("length-caps an over-long version without throwing", () => {
        const inv = parseAgentInventoryHeaders(
            headers({ "X-Agent-Version": "9".repeat(200) }),
        );
        expect(inv.agentVersion?.length).toBe(64);
    });
});

describe("inventoryChanged", () => {
    const stored = {
        agentVersion: "3.16.0",
        agentPlatform: "win32;Windows-10;py3.12.10",
        agentInstallId: VALID_INSTALL_ID,
    };

    it("is false for an identical re-send", () => {
        expect(inventoryChanged(stored, { ...stored })).toBe(false);
    });

    it("is true when the version changed", () => {
        expect(
            inventoryChanged(stored, { ...stored, agentVersion: "3.17.0" }),
        ).toBe(true);
    });

    it("is false when an incoming field is absent (omitted header never clears)", () => {
        expect(inventoryChanged(stored, { agentVersion: "3.16.0" })).toBe(
            false,
        );
    });

    it("is true for a first-seen install id", () => {
        expect(
            inventoryChanged({}, { agentInstallId: VALID_INSTALL_ID }),
        ).toBe(true);
    });
});

describe("diagnosticMetaSchema / parseMeta", () => {
    const validMeta = {
        version: "3.16.0",
        platform: "win32;Windows-10;py3.12.10",
        install_id: VALID_INSTALL_ID,
        reason: "crash",
        captured_at: "2026-06-12T10:00:00Z",
    };

    it("accepts a valid meta", () => {
        expect(parseMeta(JSON.stringify(validMeta))).toMatchObject({
            install_id: VALID_INSTALL_ID,
            reason: "crash",
        });
    });

    it("rejects a bad install id", () => {
        expect(
            diagnosticMetaSchema.safeParse({
                ...validMeta,
                install_id: "tooshort",
            }).success,
        ).toBe(false);
        expect(() =>
            parseMeta(JSON.stringify({ ...validMeta, install_id: "tooshort" })),
        ).toThrow(DiagnosticIngestError);
    });

    it("rejects an unknown reason", () => {
        expect(() =>
            parseMeta(JSON.stringify({ ...validMeta, reason: "whatever" })),
        ).toThrow(DiagnosticIngestError);
    });

    it("rejects non-JSON with invalid_meta", () => {
        try {
            parseMeta("not json {");
            throw new Error("should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(DiagnosticIngestError);
            expect((err as DiagnosticIngestError).code).toBe("invalid_meta");
        }
    });
});

describe("normalizeCapturedAt", () => {
    const fallback = "2026-06-12T12:00:00.000Z";

    it("normalizes a valid timestamp to ISO", () => {
        expect(normalizeCapturedAt("2026-06-12T10:00:00Z", fallback)).toBe(
            "2026-06-12T10:00:00.000Z",
        );
    });

    it("falls back (does NOT throw) on an unparseable timestamp", () => {
        expect(normalizeCapturedAt("garbage", fallback)).toBe(fallback);
    });
});

describe("plaintextLogName", () => {
    it("strips a trailing .gz", () => {
        expect(plaintextLogName("agent.log.gz")).toBe("agent.log");
        expect(plaintextLogName("agent.log.1.gz")).toBe("agent.log.1");
    });

    it("strips any leading path", () => {
        expect(plaintextLogName("/var/log/agent.log.gz")).toBe("agent.log");
        expect(plaintextLogName("C:\\logs\\agent.log.5.gz")).toBe(
            "agent.log.5",
        );
    });

    it("leaves a non-gz name unchanged", () => {
        expect(plaintextLogName("agent.log")).toBe("agent.log");
    });
});

describe("gunzipLogPart", () => {
    it("round-trips a gzipped log", () => {
        const text = "hello\ndiagnostic log line\n".repeat(50);
        const out = gunzipLogPart(gzipSync(Buffer.from(text, "utf-8")));
        expect(out.toString("utf-8")).toBe(text);
    });

    it("throws DiagnosticIngestError on a non-gzip buffer", () => {
        expect(() => gunzipLogPart(Buffer.from("not gzip"))).toThrow(
            DiagnosticIngestError,
        );
    });

    it("throws on a zip bomb that exceeds the decompressed cap", () => {
        // ~70 MB of zeros compresses tiny but exceeds the 64 MB output cap.
        const bomb = gzipSync(Buffer.alloc(70 * 1024 * 1024));
        try {
            gunzipLogPart(bomb);
            throw new Error("should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(DiagnosticIngestError);
            expect((err as DiagnosticIngestError).code).toBe("invalid_log");
        }
    });
});

describe("diagnosticDocId", () => {
    it("is deterministic for identical inputs", () => {
        const a = diagnosticDocId("u1", VALID_INSTALL_ID, "2026-06-12T10:00:00.000Z", "crash");
        const b = diagnosticDocId("u1", VALID_INSTALL_ID, "2026-06-12T10:00:00.000Z", "crash");
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{40}$/);
    });

    it("differs when any component differs", () => {
        const base = diagnosticDocId("u1", VALID_INSTALL_ID, "2026-06-12T10:00:00.000Z", "crash");
        expect(
            diagnosticDocId("u2", VALID_INSTALL_ID, "2026-06-12T10:00:00.000Z", "crash"),
        ).not.toBe(base);
        expect(
            diagnosticDocId("u1", VALID_INSTALL_ID, "2026-06-12T10:00:00.000Z", "on_demand"),
        ).not.toBe(base);
    });
});

describe("diagnosticBlobKey", () => {
    it("builds the user/install/doc/name path", () => {
        expect(
            diagnosticBlobKey("u1", VALID_INSTALL_ID, "deadbeef", "agent.log"),
        ).toBe(`diagnostics/u1/${VALID_INSTALL_ID}/deadbeef/agent.log`);
    });
});

describe("retention window", () => {
    afterEach(() => {
        delete process.env.DIAGNOSTICS_RETENTION_DAYS;
    });

    it("defaults to 30 days", () => {
        expect(retentionDays()).toBe(30);
    });

    it("honors a valid env override", () => {
        process.env.DIAGNOSTICS_RETENTION_DAYS = "14";
        expect(retentionDays()).toBe(14);
    });

    it("falls back to 30 on a non-positive/garbage env value", () => {
        process.env.DIAGNOSTICS_RETENTION_DAYS = "-5";
        expect(retentionDays()).toBe(30);
        process.env.DIAGNOSTICS_RETENTION_DAYS = "abc";
        expect(retentionDays()).toBe(30);
    });

    it("computes the cutoff N days before now", () => {
        const now = new Date("2026-06-12T00:00:00.000Z");
        expect(retentionCutoffIso(now, 30)).toBe("2026-05-13T00:00:00.000Z");
    });
});
