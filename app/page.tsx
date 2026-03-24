import { GoogleLoginPanel } from "@/components/auth/google-login-panel";

export default function Home() {
    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            <GoogleLoginPanel />
        </main>
    );
}
