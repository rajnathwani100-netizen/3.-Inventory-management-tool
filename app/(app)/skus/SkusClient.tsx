"use client";

import { useState, useTransition } from "react";
import { SKU, PackTypeRecord } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { createPackType, togglePackType } from "@/lib/actions/packTypes";
import toast from "react-hot-toast";

interface Props {
    initialSkus: SKU[];
    initialStockLevels: any[];
    initialPackTypes: PackTypeRecord[];
    isAdmin: boolean;
}

export default function SkusClient({ initialSkus, initialStockLevels, initialPackTypes, isAdmin }: Props) {
    const [skus, setSkus] = useState<SKU[]>(initialSkus);
    const [stockLevels, setStockLevels] = useState<any[]>(initialStockLevels);
    const [packTypes, setPackTypes] = useState<PackTypeRecord[]>(initialPackTypes);
    const [showSkuForm, setShowSkuForm] = useState(false);
    const [showPackTypeForm, setShowPackTypeForm] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [editingThreshold, setEditingThreshold] = useState<Record<string, number>>({});
    const [newSku, setNewSku] = useState({ code: "", name: "", category: "Snacks", threshold: 100 });
    const [newPackType, setNewPackType] = useState({ name: "", label: "" });
    const supabase = createClient();

    const refreshSkus = async () => {
        const { data } = await supabase.from("skus").select("*").order("code");
        if (data) setSkus(data);
    };

    const refreshStockLevels = async () => {
        const { data } = await supabase.from("stock_levels").select("*");
        if (data) setStockLevels(data);
    };

    const stockForSku = (skuId: string) =>
        stockLevels.filter((sl) => sl.sku_id === skuId);

    const handleAddSku = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSku.code || !newSku.name) { toast.error("Code and name are required"); return; }
        startTransition(async () => {
            const { data: sku, error } = await supabase.from("skus").insert({
                code: newSku.code, name: newSku.name, category: newSku.category, low_stock_threshold: newSku.threshold,
            }).select().single();
            if (error) { toast.error(error.message); return; }
            if (sku) {
                const activePackTypes = packTypes.filter((pt) => pt.is_active);
                if (activePackTypes.length > 0) {
                    await supabase.from("stock_levels").insert(
                        activePackTypes.map((pt) => ({ sku_id: sku.id, pack_type: pt.name, quantity: 0 }))
                    );
                }
            }
            toast.success("SKU added");
            setShowSkuForm(false);
            setNewSku({ code: "", name: "", category: "Snacks", threshold: 100 });
            await Promise.all([refreshSkus(), refreshStockLevels()]);
        });
    };

    const handleToggleActive = async (sku: SKU) => {
        startTransition(async () => {
            const { error } = await supabase.from("skus").update({ is_active: !sku.is_active }).eq("id", sku.id);
            if (error) { toast.error(error.message); return; }
            toast.success(sku.is_active ? "SKU archived" : "SKU restored");
            await refreshSkus();
        });
    };

    const handleUpdateThreshold = async (sku: SKU) => {
        const t = editingThreshold[sku.id];
        if (t === undefined) return;
        startTransition(async () => {
            const { error } = await supabase.from("skus").update({ low_stock_threshold: t }).eq("id", sku.id);
            if (error) { toast.error(error.message); return; }
            toast.success("Threshold updated");
            setEditingThreshold((prev) => { const n = { ...prev }; delete n[sku.id]; return n; });
            await refreshSkus();
        });
    };

    const handleAddPackType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPackType.name || !newPackType.label) { toast.error("Name and label are required"); return; }
        const safeName = newPackType.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        if (!safeName) { toast.error("Invalid pack type name"); return; }
        startTransition(async () => {
            try {
                await createPackType({ name: safeName, label: newPackType.label });
                toast.success("Pack type added");
                setShowPackTypeForm(false);
                setNewPackType({ name: "", label: "" });
                const { data } = await supabase.from("pack_types").select("*").order("sort_order");
                if (data) setPackTypes(data);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleTogglePackType = async (pt: PackTypeRecord) => {
        startTransition(async () => {
            try {
                await togglePackType(pt.id, pt.is_active);
                toast.success(pt.is_active ? "Pack type deactivated" : "Pack type activated");
                const { data } = await supabase.from("pack_types").select("*").order("sort_order");
                if (data) setPackTypes(data);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    if (!isAdmin) {
        return (
            <div className="px-4 py-10 max-w-md mx-auto text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h2 className="font-serif text-2xl text-brand-heading mb-2">Admin Access Required</h2>
                <p className="text-brand-text/60 text-sm">Only admins can manage SKUs.</p>
            </div>
        );
    }

    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-6">
            {/* SKU List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="section-title">SKU Manager</h2>
                    <button onClick={() => setShowSkuForm(!showSkuForm)} className="btn-pink text-sm py-2 px-4">
                        {showSkuForm ? "Cancel" : "+ Add SKU"}
                    </button>
                </div>

                {showSkuForm && (
                    <form onSubmit={handleAddSku} className="card space-y-4">
                        <h3 className="font-serif text-base">Add New SKU</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Code</label>
                                <input value={newSku.code} onChange={(e) => setNewSku((p) => ({ ...p, code: e.target.value }))} placeholder="KN-XX-35" className="input" />
                            </div>
                            <div>
                                <label className="label">Category</label>
                                <input value={newSku.category} onChange={(e) => setNewSku((p) => ({ ...p, category: e.target.value }))} placeholder="Snacks" className="input" />
                            </div>
                        </div>
                        <div>
                            <label className="label">Name</label>
                            <input value={newSku.name} onChange={(e) => setNewSku((p) => ({ ...p, name: e.target.value }))} placeholder="Chilly Lemony" className="input" />
                        </div>
                        <div>
                            <label className="label">Low Stock Threshold</label>
                            <input type="number" min={1} value={newSku.threshold} onChange={(e) => setNewSku((p) => ({ ...p, threshold: parseInt(e.target.value) || 100 }))} className="input" />
                        </div>
                        <button type="submit" disabled={isPending} className="btn-primary w-full">Add SKU</button>
                    </form>
                )}

                <div className="space-y-2">
                    {skus.length === 0 && <div className="card text-center py-8 text-brand-text/50 text-sm">No SKUs yet</div>}
                    {skus.map((sku) => {
                        const skuStock = stockForSku(sku.id);
                        return (
                            <div key={sku.id} className={`card ${!sku.is_active ? "opacity-50" : ""}`}>
                                <div className="flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-brand-heading text-sm">{sku.name}</span>
                                            <span className="pill bg-gray-100 text-gray-600">{sku.code}</span>
                                            <span className="pill bg-brand-pink/10 text-brand-pink">{sku.category}</span>
                                            {!sku.is_active && <span className="pill bg-gray-100 text-gray-400">Archived</span>}
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-brand-text/50">Threshold:</span>
                                            {editingThreshold[sku.id] !== undefined ? (
                                                <div className="flex items-center gap-1">
                                                    <input type="number" min={1} value={editingThreshold[sku.id]}
                                                        onChange={(e) => setEditingThreshold((p) => ({ ...p, [sku.id]: parseInt(e.target.value) || 100 }))}
                                                        className="w-20 px-2 py-1 text-xs border border-brand-pink rounded-lg focus:outline-none" autoFocus />
                                                    <button onClick={() => handleUpdateThreshold(sku)} disabled={isPending} className="text-xs text-green-600 font-semibold px-2 py-1 hover:bg-green-50 rounded-lg">Save</button>
                                                    <button onClick={() => setEditingThreshold((p) => { const n = { ...p }; delete n[sku.id]; return n; })} className="text-xs text-gray-400 px-2 py-1">Cancel</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setEditingThreshold((p) => ({ ...p, [sku.id]: sku.low_stock_threshold }))}
                                                    className="text-xs text-brand-pink font-semibold hover:underline">
                                                    {sku.low_stock_threshold} units (edit)
                                                </button>
                                            )}
                                        </div>
                                        {skuStock.length > 0 && (
                                            <div className="flex gap-2 mt-2 flex-wrap">
                                                {skuStock.map((sl) => {
                                                    const ptLabel = packTypes.find((pt) => pt.name === sl.pack_type)?.label ?? sl.pack_type;
                                                    return (
                                                        <span key={sl.id} className="text-xs bg-brand-bg border border-brand-border rounded-lg px-2 py-0.5">
                                                            {ptLabel}: <strong>{sl.quantity}</strong>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => handleToggleActive(sku)} disabled={isPending}
                                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${sku.is_active ? "border-red-200 text-red-500 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                                        {sku.is_active ? "Archive" : "Restore"}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Pack Types Management */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="section-title">Pack Types</h2>
                    <button onClick={() => setShowPackTypeForm(!showPackTypeForm)} className="btn-ghost text-sm py-2 px-4">
                        {showPackTypeForm ? "Cancel" : "+ Add"}
                    </button>
                </div>

                {showPackTypeForm && (
                    <form onSubmit={handleAddPackType} className="card space-y-4">
                        <h3 className="font-serif text-base">Add Pack Type</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Name (internal key)</label>
                                <input value={newPackType.name} onChange={(e) => setNewPackType((p) => ({ ...p, name: e.target.value }))}
                                    placeholder="pack_of_3" className="input" />
                                <p className="text-[10px] text-brand-text/40 mt-1">Spaces become underscores, lowercase only</p>
                            </div>
                            <div>
                                <label className="label">Label (display name)</label>
                                <input value={newPackType.label} onChange={(e) => setNewPackType((p) => ({ ...p, label: e.target.value }))}
                                    placeholder="Pack of 3" className="input" />
                            </div>
                        </div>
                        <button type="submit" disabled={isPending} className="btn-primary w-full">Add Pack Type</button>
                    </form>
                )}

                <div className="space-y-2">
                    {packTypes.length === 0 && <div className="card text-center py-6 text-brand-text/50 text-sm">No pack types defined</div>}
                    {packTypes.map((pt) => (
                        <div key={pt.id} className={`card flex items-center gap-3 ${!pt.is_active ? "opacity-50" : ""}`}>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-brand-heading">{pt.label}</p>
                                <p className="text-xs text-brand-text/40 font-mono">{pt.name}</p>
                            </div>
                            <span className={`pill ${pt.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                {pt.is_active ? "Active" : "Inactive"}
                            </span>
                            <button onClick={() => handleTogglePackType(pt)} disabled={isPending}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${pt.is_active ? "border-red-200 text-red-500 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                                {pt.is_active ? "Deactivate" : "Activate"}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
