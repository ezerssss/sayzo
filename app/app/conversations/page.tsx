"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ConversationsPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/app?tab=captures");
    }, [router]);

    return null;
}
