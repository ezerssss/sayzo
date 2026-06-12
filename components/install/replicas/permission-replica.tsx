import { Mic } from "lucide-react";

import { ClickMarker, ReplicaFrame } from "./replica-frame";

/**
 * Stylized depiction of macOS permission alerts. The microphone alert is
 * shown as the recognizable example, with a second alert peeking out behind
 * it — the Mac asks for a few permissions, and the answer is Allow each time.
 */
export function PermissionReplica() {
    return (
        <ReplicaFrame caption="When your Mac asks — click “Allow”">
            <div className="relative w-full max-w-[230px]">
                <div
                    className="absolute -top-2 left-3 h-full w-[calc(100%-1.5rem)] rounded-xl bg-[#e8e8e8]/80 ring-1 ring-black/5"
                    aria-hidden
                />
                <div className="relative rounded-xl bg-[#f2f2f2]/95 p-4 text-center shadow-lg shadow-black/15 ring-1 ring-black/10">
                    <span className="mx-auto flex size-9 items-center justify-center rounded-full bg-[#e3e3e3]">
                        <Mic
                            className="size-4.5 text-[#4d4d4d]"
                            strokeWidth={2}
                        />
                    </span>
                    <p className="mt-2.5 text-[11px] leading-snug font-semibold text-[#1d1d1f]">
                        “Sayzo” would like to access the microphone.
                    </p>
                    <p className="mt-1 text-[9px] leading-snug text-[#6e6e73]">
                        Sayzo uses the microphone to hear the meetings you
                        choose to bring in.
                    </p>
                    <div className="mt-3 flex gap-2">
                        <span className="flex-1 rounded-md bg-white px-2 py-1.5 text-[10px] font-medium text-[#1d1d1f] ring-1 ring-black/10">
                            Don’t Allow
                        </span>
                        <span className="relative flex-1 rounded-md bg-[#0071e3] px-2 py-1.5 text-[10px] font-medium text-white">
                            Allow
                            <ClickMarker
                                number={1}
                                className="-top-2 -right-2"
                            />
                        </span>
                    </div>
                </div>
            </div>
        </ReplicaFrame>
    );
}
