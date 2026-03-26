import { HTTPError, TimeoutError } from "ky";

function pickApiErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === "string" && errorValue.trim()) {
        return errorValue.trim();
    }
    const detailValue = (payload as { detail?: unknown }).detail;
    if (typeof detailValue === "string" && detailValue.trim()) {
        return detailValue.trim();
    }
    return null;
}

async function readHttpErrorMessage(error: HTTPError): Promise<string | null> {
    try {
        const body = (await error.response.clone().json()) as unknown;
        return pickApiErrorMessage(body);
    } catch {
        try {
            const text = (await error.response.clone().text()).trim();
            return text.length > 0 ? text : null;
        } catch {
            return null;
        }
    }
}

export async function getKyErrorMessage(
    error: unknown,
    fallback: string,
): Promise<string> {
    if (error instanceof TimeoutError) {
        return "This request is taking longer than expected. Please wait and try again.";
    }

    if (error instanceof HTTPError) {
        const status = error.response.status;
        const apiMessage = await readHttpErrorMessage(error);
        if (apiMessage) return apiMessage;

        if (status === 502 || status === 503 || status === 504) {
            return "The server is still processing a long-running task. Please try again in a moment.";
        }
        if (status === 408) {
            return "The request timed out before completion. Please retry.";
        }
        return fallback;
    }

    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

export function isKyTimeoutLikeError(error: unknown): boolean {
    if (error instanceof TimeoutError) return true;
    if (error instanceof HTTPError) {
        const status = error.response.status;
        return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
    }
    return false;
}
