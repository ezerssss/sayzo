import Image from "next/image";
import { Folder, MoveRight } from "lucide-react";

import { ClickMarker, ReplicaFrame } from "./replica-frame";

/**
 * Stylized depiction of the macOS install window: drag the Sayzo icon onto
 * the Applications folder shortcut sitting right next to it.
 */
export function DmgWindowReplica() {
    return (
        <ReplicaFrame caption="Drag Sayzo onto Applications">
            <div className="w-full max-w-[280px] overflow-hidden rounded-lg bg-[#f6f6f6] shadow-lg shadow-black/15 ring-1 ring-black/10">
                <div className="relative flex items-center border-b border-black/5 bg-[#ececec] px-2.5 py-1.5">
                    <span className="flex gap-1.5">
                        <span className="size-2 rounded-full bg-[#ff5f57]" />
                        <span className="size-2 rounded-full bg-[#febc2e]" />
                        <span className="size-2 rounded-full bg-[#28c840]" />
                    </span>
                    <span className="absolute inset-x-0 text-center text-[10px] font-medium text-[#4d4d4d]">
                        Sayzo
                    </span>
                </div>
                <div className="flex items-center justify-center gap-5 px-5 py-6">
                    <div className="flex flex-col items-center gap-1">
                        <Image
                            src="/sayzo-logo.png"
                            alt=""
                            width={40}
                            height={40}
                            className="rounded-[10px] shadow-sm"
                        />
                        <span className="text-[9px] font-medium text-[#4d4d4d]">
                            Sayzo
                        </span>
                    </div>
                    <span className="relative text-[#86868b]">
                        <MoveRight className="size-6" strokeWidth={1.5} />
                        <ClickMarker number={1} className="-top-4 -right-1" />
                    </span>
                    <div className="flex flex-col items-center gap-1">
                        <Folder
                            className="size-10 fill-[#6cb5f9] text-[#4ba0f4]"
                            strokeWidth={1}
                        />
                        <span className="text-[9px] font-medium text-[#4d4d4d]">
                            Applications
                        </span>
                    </div>
                </div>
            </div>
        </ReplicaFrame>
    );
}
