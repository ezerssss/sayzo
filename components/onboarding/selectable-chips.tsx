"use client";

import { cn } from "@/lib/utils";

interface PropsInterface {
    options: readonly string[];
    selected: string[];
    onChange: (next: string[]) => void;
}

export function SelectableChips(props: Readonly<PropsInterface>) {
    const { options, selected, onChange } = props;

    function toggle(option: string) {
        if (selected.includes(option)) {
            onChange(selected.filter((s) => s !== option));
        } else {
            onChange([...selected, option]);
        }
    }

    return (
        <div className="flex flex-wrap gap-2">
            {options.map((option) => {
                const isOn = selected.includes(option);
                return (
                    <button
                        key={option}
                        type="button"
                        onClick={() => toggle(option)}
                        className={cn(
                            "rounded-full border px-3 py-1.5 text-sm transition-colors",
                            isOn
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-foreground hover:bg-muted",
                        )}
                    >
                        {option}
                    </button>
                );
            })}
        </div>
    );
}
