"use client";

import { useState } from "react";
import { SKU } from "@/lib/types";

interface BatchItem {
    skuId: string;
    quantity: number;
}

interface BatchSkuPickerProps {
    skus: SKU[];
    value: BatchItem[];
    onChange: (items: BatchItem[]) => void;
}

export default function BatchSkuPicker({ skus, value, onChange }: BatchSkuPickerProps) {
    // rawQty holds the "in-progress" string value per skuId while user is typing
    const [rawQty, setRawQty] = useState<Record<string, string>>({});

    const selectedIds = new Set(value.map((v) => v.skuId));

    const toggleSku = (skuId: string) => {
        if (selectedIds.has(skuId)) {
            onChange(value.filter((v) => v.skuId !== skuId));
            // Clear raw state when deselected
            setRawQty((prev) => { const next = { ...prev }; delete next[skuId]; return next; });
        } else {
            onChange([...value, { skuId, quantity: 1 }]);
        }
    };

    const updateQty = (skuId: string, qty: number) => {
        const safe = Math.max(1, qty);
        onChange(value.map((v) => (v.skuId === skuId ? { ...v, quantity: safe } : v)));
        // Sync raw display with the clamped value
        setRawQty((prev) => ({ ...prev, [skuId]: String(safe) }));
    };

    const selectAll = () => {
        if (value.length === skus.length) {
            onChange([]);
            setRawQty({});
        } else {
            onChange(skus.map((s) => ({ skuId: s.id, quantity: value.find((v) => v.skuId === s.id)?.quantity ?? 1 })));
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">SKUs & Quantities</label>
                <button type="button" onClick={selectAll} className="text-xs text-brand-pink font-semibold hover:text-brand-hover transition-colors">
                    {value.length === skus.length ? "Deselect all" : "Select all"}
                </button>
            </div>
            <div className="space-y-1.5">
                {skus.map((sku) => {
                    const selected = selectedIds.has(sku.id);
                    const item = value.find((v) => v.skuId === sku.id);
                    // Show raw string while typing, otherwise show committed quantity
                    const displayValue = rawQty[sku.id] !== undefined ? rawQty[sku.id] : String(item?.quantity ?? 1);

                    return (
                        <div
                            key={sku.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selected ? "border-brand-pink/40 bg-brand-pink/5" : "border-brand-border bg-white hover:border-gray-300"}`}
                            onClick={() => toggleSku(sku.id)}
                        >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${selected ? "bg-brand-pink border-brand-pink" : "border-gray-300"}`}>
                                {selected && (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-brand-heading truncate">{sku.name}</p>
                                <p className="text-xs text-brand-text/50">{sku.code}</p>
                            </div>
                            {selected && (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" onClick={() => updateQty(sku.id, (item?.quantity ?? 1) - 1)}
                                        className="w-7 h-7 rounded-lg bg-gray-100 text-brand-heading font-bold text-sm flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-all">−</button>
                                    <input
                                        type="number"
                                        min={1}
                                        value={displayValue}
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            // Always update the raw display string so the field is editable freely
                                            setRawQty((prev) => ({ ...prev, [sku.id]: raw }));
                                            const parsed = parseInt(raw, 10);
                                            if (!isNaN(parsed) && parsed >= 1) {
                                                // Commit valid values immediately to parent
                                                onChange(value.map((v) => v.skuId === sku.id ? { ...v, quantity: parsed } : v));
                                            }
                                        }}
                                        onBlur={() => {
                                            // On blur: enforce minimum 1 and clear the raw override
                                            const current = item?.quantity ?? 0;
                                            const safe = isNaN(current) || current < 1 ? 1 : current;
                                            onChange(value.map((v) => v.skuId === sku.id ? { ...v, quantity: safe } : v));
                                            setRawQty((prev) => { const next = { ...prev }; delete next[sku.id]; return next; });
                                        }}
                                        onFocus={(e) => e.target.select()}
                                        className="w-14 text-center text-sm font-bold border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-brand-pink"
                                    />
                                    <button type="button" onClick={() => updateQty(sku.id, (item?.quantity ?? 1) + 1)}
                                        className="w-7 h-7 rounded-lg bg-brand-pink text-white font-bold text-sm flex items-center justify-center hover:bg-brand-hover active:scale-90 transition-all">+</button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {value.length > 0 && (
                <p className="text-xs text-brand-text/50 mt-2">
                    {value.length} SKU{value.length > 1 ? "s" : ""} selected · {value.reduce((s, v) => s + v.quantity, 0)} total units
                </p>
            )}
        </div>
    );
}
