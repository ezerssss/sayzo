import "server-only";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import type {
    CaptureCloseReason,
    CaptureTranscriptLine,
} from "@/types/captures";

const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50 MB — well above the 28 MB worst case (60 min @ 64 kbps)
const MIN_AUDIO_SIZE = 256; // bytes — anything smaller can't even fit a valid OGG header

/**
 * Internal representation of an agent capture record after parsing the
 * snake_case wire format JSON. All field names are camelCase to match the
 * rest of the codebase; the snake_case <-> camelCase translation lives only
 * inside `parseAndValidateRecord`.
 */
export type AgentRecord = {
    id: string;
    startedAt: string;
    endedAt: string;
    title: string;
    summary: string;
    transcript: CaptureTranscriptLine[];
    audioPath: string;
    relevantSpan: [number, number];
    metadata: { closeReason: CaptureCloseReason };
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
        throw new IngestError(
            "invalid_record",
            "Missing required field: id",
        );
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
    if (!r.title || typeof r.title !== "string")
        throw new IngestError(
            "invalid_record",
            "Missing required field: title",
        );
    if (!r.summary || typeof r.summary !== "string")
        throw new IngestError(
            "invalid_record",
            "Missing required field: summary",
        );
    if (!Array.isArray(r.transcript) || r.transcript.length === 0)
        throw new IngestError(
            "invalid_record",
            "Missing required field: transcript",
        );

    for (const line of r.transcript) {
        if (!line || typeof line !== "object")
            throw new IngestError(
                "invalid_record",
                "Invalid transcript line",
            );
        const l = line as Record<string, unknown>;
        if (
            typeof l.speaker !== "string" ||
            typeof l.start !== "number" ||
            typeof l.end !== "number" ||
            typeof l.text !== "string"
        )
            throw new IngestError(
                "invalid_record",
                "Transcript line missing required fields (speaker, start, end, text)",
            );
    }

    const relevantSpan = Array.isArray(r.relevant_span)
        ? (r.relevant_span as [number, number])
        : ([0, 0] as [number, number]);

    const metadata = (r.metadata as Record<string, unknown>) ?? {};
    const closeReason =
        (metadata.close_reason as CaptureCloseReason) ?? "joint_silence";

    return {
        id: r.id as string,
        startedAt: r.started_at as string,
        endedAt: r.ended_at as string,
        title: r.title as string,
        summary: r.summary as string,
        transcript: r.transcript as CaptureTranscriptLine[],
        audioPath: (r.audio_path as string) ?? "audio.opus",
        relevantSpan,
        metadata: { closeReason },
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

export async function ingestCapture(
    uid: string,
    record: AgentRecord,
    audio: File,
): Promise<{ captureId: string; status: "queued" }> {
    if (audio.size > MAX_AUDIO_SIZE) {
        throw new IngestError(
            "payload_too_large",
            "Audio file exceeds 50MB limit",
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

    const captureRef = db
        .collection(FirestoreCollections.captures.path)
        .doc();
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
        title: record.title,
        summary: record.summary,
        agentTranscript: record.transcript,
        relevantSpan: record.relevantSpan,
        closeReason: record.metadata.closeReason,
        audioStoragePath: storagePath,
    });

    return { captureId, status: "queued" };
}
