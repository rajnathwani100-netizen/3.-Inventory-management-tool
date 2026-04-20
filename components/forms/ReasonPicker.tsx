"use client";

interface ReasonPickerProps {
    reasons: string[];
    value: string;
    onChange: (reason: string) => void;
}

export default function ReasonPicker({ reasons, value, onChange }: ReasonPickerProps) {
    const isCustom = value && !reasons.includes(value);
    const showCustomInput = value === "__custom__" || isCustom;

    const handlePillClick = (reason: string) => {
        if (reason === "Other") {
            onChange("__custom__");
        } else {
            onChange(reason);
        }
    };

    return (
        <div>
            <label className="label">Reason</label>
            <div className="flex flex-wrap gap-2 mb-2">
                {reasons.map((reason) => {
                    const active = reason === "Other" ? showCustomInput : value === reason;
                    return (
                        <button key={reason} type="button" onClick={() => handlePillClick(reason)}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${active ? "bg-brand-pink text-white border-brand-pink" : "bg-white text-brand-heading border-brand-border hover:border-brand-pink/40"}`}>
                            {reason === "Other" ? "+ Custom" : reason}
                        </button>
                    );
                })}
            </div>
            {showCustomInput && (
                <input type="text" placeholder="Enter custom reason..."
                    value={isCustom ? value : ""}
                    onChange={(e) => onChange(e.target.value || "__custom__")}
                    autoFocus className="input" />
            )}
        </div>
    );
}
