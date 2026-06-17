import { ImageResponse } from "next/og";

// Branded 1200x630 social card, inherited by every route. Kept static (no
// request-time data or remote fonts) so it builds once — the droplet has no
// Vercel OG runtime. Default Satori font; large type carries the brand.

export const alt =
    "Sayzo — English speaking coach for your real work conversations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    background: "#ffffff",
                    padding: "80px",
                }}
            >
                {/* Top accent bar — the brand blue */}
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        display: "flex",
                        width: "100%",
                        height: 12,
                        background: "linear-gradient(90deg, #0284c7, #2563eb)",
                    }}
                />

                {/* Eyebrow */}
                <div
                    style={{
                        display: "flex",
                        fontSize: 30,
                        fontWeight: 600,
                        letterSpacing: 6,
                        textTransform: "uppercase",
                        color: "#0284c7",
                        marginBottom: 28,
                    }}
                >
                    English speaking coach
                </div>

                {/* Wordmark */}
                <div
                    style={{
                        display: "flex",
                        fontSize: 150,
                        fontWeight: 700,
                        lineHeight: 1,
                        letterSpacing: -4,
                        color: "#0a0a0a",
                    }}
                >
                    Sayzo
                </div>

                {/* Accent rule */}
                <div
                    style={{
                        display: "flex",
                        width: 132,
                        height: 10,
                        borderRadius: 9999,
                        background: "#2563eb",
                        margin: "40px 0",
                    }}
                />

                {/* Tagline */}
                <div
                    style={{
                        display: "flex",
                        fontSize: 48,
                        lineHeight: 1.25,
                        color: "#334155",
                        maxWidth: 920,
                    }}
                >
                    Coaching from your real work conversations.
                </div>

                {/* Footer URL */}
                <div
                    style={{
                        position: "absolute",
                        bottom: 64,
                        left: 80,
                        display: "flex",
                        fontSize: 30,
                        color: "#64748b",
                    }}
                >
                    sayzo.app
                </div>
            </div>
        ),
        { ...size },
    );
}
