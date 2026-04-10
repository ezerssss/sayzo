import "server-only";

import { SignJWT, jwtVerify } from "jose";

const getSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error(
            "JWT_SECRET is not set. Add it to .env.local (use a random 64+ character hex string).",
        );
    }
    return new TextEncoder().encode(secret);
};

export async function signAccessToken(payload: {
    sub: string;
    email: string;
}): Promise<string> {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(getSecret());
}

export async function verifyAccessToken(
    token: string,
): Promise<{ sub: string; email: string }> {
    const { payload } = await jwtVerify(token, getSecret());
    return { sub: payload.sub as string, email: payload.email as string };
}
