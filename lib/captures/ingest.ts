import "server-only";

import { FirestoreCollections } from "@/schemas";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase/admin";
import type { CaptureCloseReason } from "@/schemas";

const MAX_AUDIO_SIZE = 200 * 1024 * 1024; // 200 MB — ≈ 4 hr @ 64 kbps stereo Opus, ≈ 2 hr @ 128 kbps
const MIN_AUDIO_SIZE = 256; // bytes — anything smaller can't even fit a valid OGG header

/**
 * Internal representation of an agent capture record after parsing the
 * snake_case wire format JSON. The server only needs identity + timestamps +
 * close reason to ingest a capture — transcription, title, summary, and
 * relevant span are all generated server-side from the audio.
 *
 * Older agents (≤ v2.2.x) still ship `title`, `summary`, `transcript`,
 * `relevant_span`, etc. Those fields are accepted (no schema break) but
 * ignored — Deepgram output is always the source of truth. See the
 * `dual_mode_old_agent` info log emitted by `parseAndValidateRecord` for
 * adoption tracking.
 */
export type AgentRecord = {
    id: string;
    startedAt: string;
    endedAt: string;
    closeReason: CaptureCloseReason;
};

export class IngestError extends Error {
    constructor(
        public code: string,
        message: string,
    ) {
        super(message);
        this.name = "IngestError";
    }
}

export function parseAndValidateRecord(raw: string): AgentRecord {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new IngestError("invalid_record", "Record is not valid JSON");
    }

    const r = parsed as Record<string, unknown>;

    if (!r.id || typeof r.id !== "string")
        throw new IngestError("invalid_record", "Missing required field: id");
    if (!r.started_at || typeof r.started_at !== "string")
        throw new IngestError(
            "invalid_record",
            "Missing required field: started_at",
        );
    if (!r.ended_at || typeof r.ended_at !== "string")
        throw new IngestError(
            "invalid_record",
            "Missing required field: ended_at",
        );

    const metadata = (r.metadata as Record<string, unknown>) ?? {};
    const closeReason =
        (metadata.close_reason as CaptureCloseReason) ?? "joint_silence";

    // Dual-mode rollout: log when an old agent sends fields the server no
    // longer reads, so we can track adoption of the audio-only client. Sample
    // a single line per upload — don't enumerate every field.
    const hasLegacyFields =
        Array.isArray(r.transcript) ||
        typeof r.title === "string" ||
        typeof r.summary === "string" ||
        Array.isArray(r.relevant_span) ||
        typeof metadata.local_llm_used === "boolean" ||
        typeof metadata.placeholder_title === "boolean";
    if (hasLegacyFields) {
        console.info("[captures/ingest] dual_mode_old_agent", {
            recordId: r.id,
        });
    }

    return {
        id: r.id as string,
        startedAt: r.started_at as string,
        endedAt: r.ended_at as string,
        closeReason,
    };
}

/**
 * Magic-byte validation: confirms the upload actually looks like an OGG Opus
 * file before we burn Cloud Storage and STT API spend on garbage. Spoofed
 * Content-Type / file extensions are ignored — only the bytes count.
 *
 * - Every OGG page starts with the ASCII signature "OggS" (0x4F 0x67 0x67 0x53).
 * - Opus-in-OGG writes an "OpusHead" identification packet inside the first
 *   logical page, well within the first 256 bytes.
 *
 * Both checks together reject random binary blobs, image/video files renamed
 * to .opus, and OGG containers carrying non-Opus codecs.
 */
function isValidOggOpusFile(bytes: Uint8Array): boolean {
    if (bytes.length < MIN_AUDIO_SIZE) return false;

    // OggS magic bytes
    if (
        bytes[0] !== 0x4f ||
        bytes[1] !== 0x67 ||
        bytes[2] !== 0x67 ||
        bytes[3] !== 0x53
    ) {
        return false;
    }

    // OpusHead identification packet should be within the first OGG page
    const headerSlice = bytes.subarray(0, Math.min(bytes.length, 256));
    const headerStr = new TextDecoder("ascii", { fatal: false }).decode(
        headerSlice,
    );
    return headerStr.includes("OpusHead");
}

export type IngestCaptureInput = {
    record: AgentRecord;
    audio: File;
    /** Synthesized placeholder title shown in the UI until `serverTitle` lands after Deepgram. */
    placeholderTitle: string;
};

export async function ingestCapture(
    uid: string,
    input: IngestCaptureInput,
): Promise<{ captureId: string; status: "queued" }> {
    const { record, audio, placeholderTitle } = input;

    if (audio.size > MAX_AUDIO_SIZE) {
        throw new IngestError(
            "payload_too_large",
            "Audio file exceeds 200MB limit",
        );
    }
    if (audio.size < MIN_AUDIO_SIZE) {
        throw new IngestError(
            "invalid_audio",
            "Audio file is too small to be a valid recording",
        );
    }

    const audioBytes = new Uint8Array(await audio.arrayBuffer());
    if (!isValidOggOpusFile(audioBytes)) {
        throw new IngestError(
            "invalid_audio",
            "Audio file is not a valid OGG Opus recording",
        );
    }

    const db = getAdminFirestore();
    const bucket = getAdminStorageBucket();

    const captureRef = db.collection(FirestoreCollections.captures.path).doc();
    const captureId = captureRef.id;

    const storagePath = `captures/${uid}/${captureId}/audio.opus`;
    const file = bucket.file(storagePath);
    await file.save(Buffer.from(audioBytes), {
        resumable: false,
        contentType: "audio/ogg",
    });

    await captureRef.set({
        uid,
        status: "queued",
        rejectionReason: null,
        uploadedAt: new Date().toISOString(),
        retryCount: 0,

        agentRecordId: record.id,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        title: placeholderTitle,
        summary: "",
        closeReason: record.closeReason,
        audioStoragePath: storagePath,
    });

    return { captureId, status: "queued" };
}
