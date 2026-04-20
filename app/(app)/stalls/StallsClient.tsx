"use client";

import { useState, useTransition } from "react";
import { SKU, PACK_TYPE_LABELS, PackType } from "@/lib/types";
import { openStall, logReturn } from "@/lib/actions/stalls";
import { createConversion, completeConversion } from "@/lib/actions/conversions";
import toast from "react-hot-toast";

interface Props {
    skus: SKU[];
    initialStalls: any[];
    initialConversions: any[];
}

export default function StallsClient({ skus, initialStalls, initialConversions }: Props) {
    const [stalls, setStalls] = useState(initialStalls);
    const [conversions, setConversions] = useState(initialConversions);
    const [isPending, startTransition] = useTransition();
    const [showStallForm, setShowStallForm] = useState(false);
    const [showWipForm, setShowWipForm] = useState(false);
    const [returnInputs, setReturnInputs] = useState<Record<string, string>>({});

    const [stallName, setStallName] = useState("");
    const [stallLocation, setStallLocation] = useState("");
    const [stallDate, setStallDate] = useState(new Date().toISOString().split("T")[0]);
    const [stallSkuId, setStallSkuId] = useState(skus[0]?.id ?? "");
    const [stallPackType, setStallPackType] = useState<PackType>("30g_individual");
    const [stallDispatched, setStallDispatched] = useState(1);

    const [wipSkuId, setWipSkuId] = useState(skus[0]?.id ?? "");
    const [wipPacks, setWipPacks] = useState(6);

    const handleOpenStall = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stallName) { toast.error("Enter a stall name"); return; }
        startTransition(async () => {
            try {
                await openStall({ name: stallName, location: stallLocation, date: stallDate, skuId: stallSkuId, packType: stallPackType, dispatched: stallDispatched });
                toast.success("Stall opened & stock dispatched");
                setShowStallForm(false); setStallName(""); setStallLocation(""); setStallDispatched(1);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleLogReturn = async (stallId: string, stallItemId: string) => {
        const returned = parseInt(returnInputs[stallItemId] ?? "0");
        if (isNaN(returned) || returned < 0) { toast.error("Invalid return quantity"); return; }
        startTransition(async () => {
            try {
                await logReturn({ stallId, stallItemId, returned });
                toast.success("Return logged, stall closed");
                setReturnInputs((prev) => { const n = { ...prev }; delete n[stallItemId]; return n; });
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleCreateConversion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (wipPacks < 6) { toast.error("Minimum 6 packs for conversion"); return; }
        startTransition(async () => {
            try {
                await createConversion({ skuId: wipSkuId, packs30gIn: wipPacks });
                toast.success("Conversion created");
                setShowWipForm(false);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleCompleteConversion = async (id: string) => {
        startTransition(async () => {
            try {
                await completeConversion(id);
                toast.success("Conversion completed, stock updated");
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const activeStalls = stalls.filter((s) => s.status === "active");
    const closedStalls = stalls.filter((s) => s.status === "closed");

    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-6">
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="section-title">Stall Manager</h2>
                    <button onClick={() => setShowStallForm(!showStallForm)} className="btn-pink text-sm py-2 px-4">
                        {showStallForm ? "Cancel" : "+ Open Stall"}
                    </button>
                </div>

                {showStallForm && (
                    <form onSubmit={handleOpenStall} className="card space-y-4 mb-4">
                        <h3 className="font-serif text-base">New Stall Session</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Stall Name *</label>
                                <input value={stallName} onChange={(e) => setStallName(e.target.value)} placeholder="e.g. Bandra Market" className="input" required />
                            </div>
                            <div>
                                <label className="label">Location</label>
                                <input value={stallLocation} onChange={(e) => setStallLocation(e.target.value)} placeholder="Optional" className="input" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Date</label>
                                <input type="date" value={stallDate} onChange={(e) => setStallDate(e.target.value)} className="input" />
                            </div>
                            <div>
                                <label className="label">Dispatched Qty</label>
                                <input type="number" min={1} value={stallDispatched} onChange={(e) => setStallDispatched(parseInt(e.target.value) || 1)} className="input" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">SKU</label>
                                <select value={stallSkuId} onChange={(e) => setStallSkuId(e.target.value)} className="input">
                                    {skus.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">Pack Type</label>
                                <select value={stallPackType} onChange={(e) => setStallPackType(e.target.value as PackType)} className="input">
                                    {(["30g_individual", "pack_of_6", "sample_200g"] as PackType[]).map((pt) => (
                                        <option key={pt} value={pt}>{PACK_TYPE_LABELS[pt]}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button type="submit" disabled={isPending} className="btn-primary w-full">Open Stall & Dispatch</button>
                    </form>
                )}

                {activeStalls.length === 0 && !showStallForm && (
                    <div className="card text-center py-8 text-brand-text/50 text-sm">No active stalls</div>
                )}

                <div className="space-y-3">
                    {activeStalls.map((stall: any) => (
                        <div key={stall.id} className="card border-green-200">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="pill bg-green-100 text-green-700">Active</span>
                                <h3 className="font-semibold text-brand-heading">{stall.name}</h3>
                                {stall.location && <span className="text-xs text-brand-text/50">· {stall.location}</span>}
                                <span className="ml-auto text-xs text-brand-text/40">{stall.date}</span>
                            </div>
                            {(stall.stall_items || []).map((item: any) => {
                                const dispatched = item.dispatched;
                                const returned = item.returned ?? 0;
                                const sold = dispatched - returned;
                                const pct = dispatched > 0 ? Math.round((sold / dispatched) * 100) : 0;
                                return (
                                    <div key={item.id} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-brand-text/70">{item.sku?.name ?? "?"} · {PACK_TYPE_LABELS[item.pack_type as PackType]}</span>
                                            <span className="font-semibold">{sold} sold / {dispatched} dispatched</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className="bg-brand-pink h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                        <p className="text-xs text-brand-text/50">{pct}% sell-through</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <input type="number" min={0} max={dispatched}
                                                value={returnInputs[item.id] ?? ""}
                                                onChange={(e) => setReturnInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                                placeholder="Return qty" className="input py-2 text-sm" />
                                            <button onClick={() => handleLogReturn(stall.id, item.id)} disabled={isPending} className="btn-ghost text-sm py-2 px-4 whitespace-nowrap">
                                                Log Return
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {closedStalls.length > 0 && (
                    <details className="mt-4">
                        <summary className="text-sm text-brand-text/50 cursor-pointer mb-2">Closed stalls ({closedStalls.length})</summary>
                        <div className="space-y-2">
                            {closedStalls.map((stall: any) => (
                                <div key={stall.id} className="card opacity-70">
                                    <div className="flex items-center gap-2">
                                        <span className="pill bg-gray-100 text-gray-500">Closed</span>
                                        <span className="font-medium text-sm">{stall.name}</span>
                                        <span className="ml-auto text-xs text-brand-text/40">{stall.date}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </div>

            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="section-title">WIP Conversions</h2>
                    <button onClick={() => setShowWipForm(!showWipForm)} className="btn-ghost text-sm py-2 px-4">
                        {showWipForm ? "Cancel" : "+ Convert"}
                    </button>
                </div>

                {showWipForm && (
                    <form onSubmit={handleCreateConversion} className="card space-y-4 mb-4">
                        <h3 className="font-serif text-base">30g → Pack of 6</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">SKU</label>
                                <select value={wipSkuId} onChange={(e) => setWipSkuId(e.target.value)} className="input">
                                    {skus.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">30g Packs In</label>
                                <input type="number" min={6} step={6} value={wipPacks} onChange={(e) => setWipPacks(parseInt(e.target.value) || 6)} className="input" />
                            </div>
                        </div>
                        <div className="bg-brand-bg rounded-xl p-3 text-sm">
                            <p className="text-brand-heading font-semibold">{wipPacks} packs → {Math.floor(wipPacks / 6)} Pack of 6</p>
                            {wipPacks % 6 !== 0 && <p className="text-amber-600 text-xs mt-1">⚠️ {wipPacks % 6} leftover packs (will not be converted)</p>}
                        </div>
                        <button type="submit" disabled={isPending} className="btn-primary w-full">Create Conversion</button>
                    </form>
                )}

                {conversions.length === 0 ? (
                    <div className="card text-center py-6 text-brand-text/50 text-sm">No conversions yet</div>
                ) : (
                    <div className="space-y-2">
                        {conversions.map((conv: any) => (
                            <div key={conv.id} className="card flex items-center gap-3">
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-brand-heading">{conv.sku?.name ?? "?"}</p>
                                    <p className="text-xs text-brand-text/50">{conv.packs_30g_in} → {conv.packs_of_6_out} Pack of 6</p>
                                </div>
                                {conv.status === "in_progress" ? (
                                    <button onClick={() => handleCompleteConversion(conv.id)} disabled={isPending} className="btn-pink text-xs py-1.5 px-3">Mark Done</button>
                                ) : (
                                    <span className="pill-approved pill">Done</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
