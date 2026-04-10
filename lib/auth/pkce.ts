import "server-only";

import { createHash } from "crypto";

/**
 * Verify a PKCE code_verifier against the stored code_challenge.
 * S256: BASE64URL(SHA256(code_verifier)) === code_challenge
 */
export function verifyPkce(
    codeVerifier: string,
    codeChallenge: string,
): boolean {
    const hash = createHash("sha256").update(codeVerifier).digest("base64url");
    return hash === codeChallenge;
}
