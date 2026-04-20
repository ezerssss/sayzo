import "server-only";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

// Minimal redaction set — credentials + payment + government ID only.
// Deliberately NOT using redact=pii because it eats conversational content
// (names, locations, ages, occupations, organizations) that Sayzo's coaching
// signal depends on. See project_sayzo_deepgram_migration.md for rationale.
const REDACTION_ENTITIES: readonly string[] = [
    "credit_card",
    "credit_card_expiration",
    "cvv",
    "ssn",
    "bank_account",
    "routing_number",
    "passport_number",
    "password",
];

/**
 * Plain-text transcription for short single-speaker clips (skip / reflection
 * feedback). Uses Deepgram Nova-3 in batch mode. No multichannel or diarize —
 * these clips are user-only voice input.
 */
export async function transcribeAudioFileToPlainText(
    file: File,
): Promise<string> {
    const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("Missing DEEPGRAM_API_KEY.");
    }

    const params = new URLSearchParams();
    params.set("model", "nova-3");
    params.set("language", "en");
    params.set("punctuate", "true");
    params.set("smart_format", "true");
    params.set("filler_words", "true");
    for (const entity of REDACTION_ENTITIES) {
        params.append("redact", entity);
    }

    const audioBytes = await file.arrayBuffer();

    const res = await fetch(`${DEEPGRAM_URL}?${params.toString()}`, {
        method: "POST",
        headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": file.type || "application/octet-stream",
        },
        body: audioBytes,
    });

    if (!res.ok) {
        const detail = await res.text();
        throw new Error(
            `Transcription failed (${res.status}): ${detail.slice(0, 500)}`,
        );
    }

    const body = (await res.json()) as {
        results?: {
            channels?: Array<{
                alternatives?: Array<{ transcript?: string }>;
            }>;
        };
    };

    return (
        body.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ""
    ).trim();
}
