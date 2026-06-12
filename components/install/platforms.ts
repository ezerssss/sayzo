export type OS = "windows" | "macos";

type PlatformCopy = {
    label: string;
    shell: string;
    command: string;
    downloadUrl: string;
    fileName: string;
    minOS: string;
};

export const PLATFORMS: Record<OS, PlatformCopy> = {
    windows: {
        label: "Windows",
        shell: "PowerShell",
        command: "irm https://sayzo.app/releases/windows/install.ps1 | iex",
        downloadUrl: "https://sayzo.app/releases/windows/sayzo-setup.exe",
        fileName: "sayzo-setup.exe",
        minOS: "Windows 10 or newer",
    },
    macos: {
        label: "macOS",
        shell: "Terminal",
        command:
            "curl -fsSL https://sayzo.app/releases/macos/install.sh | bash",
        downloadUrl: "https://sayzo.app/releases/macos/Sayzo.dmg",
        fileName: "Sayzo.dmg",
        minOS: "macOS 14.4 or newer",
    },
};

// Read by the dashboard to compute time-from-download-to-first-capture.
export const DOWNLOAD_TIMESTAMP_KEY = "sayzo.desktop.downloadedAt";

export function detectOS(): OS {
    if (typeof navigator === "undefined") return "windows";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac") || ua.includes("iphone") || ua.includes("ipad")) {
        return "macos";
    }
    return "windows";
}

export function otherOS(os: OS): OS {
    return os === "windows" ? "macos" : "windows";
}
