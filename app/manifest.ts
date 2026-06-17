import type { MetadataRoute } from "next";

// Web app manifest. Next auto-links it from the head. A dedicated 192/512
// maskable icon set is a nice-to-have follow-up; the square logo with
// sizes "any" is acceptable for now.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Sayzo — English speaking coach",
        short_name: "Sayzo",
        description:
            "English speaking coach for non-native pros on global teams. Sayzo joins the calls you choose, coaches every conversation, and replays the moments that matter.",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
            {
                src: "/sayzo-logo.png",
                sizes: "any",
                type: "image/png",
            },
        ],
    };
}
