"use client";

import { useParams } from "next/navigation";

import { ConversationDetailView } from "@/components/conversations/conversation-detail-view";
import { useAuthUser } from "@/hooks/use-auth-user";

export default function ConversationDetailPage() {
    const { user } = useAuthUser();
    const params = useParams<{ captureId: string }>();

    if (!user) return null;

    return <ConversationDetailView captureId={params.captureId} uid={user.uid} />;
}
