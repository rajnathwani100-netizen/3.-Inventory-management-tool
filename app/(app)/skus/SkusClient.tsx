"use client";

import { useState, useTransition } from "react";
import { SKU } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

interface Props {
    initialSkus: SKU[];
    isAdmin: boolean;
}

export default function SkusClient({ initialSkus, isAdmin }: Props) {
    const [skus, setSkus] = useState<SKU[]>(initialSkus);
    const [showForm, setShowForm] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [editingThreshold, setEditingThreshold] = useState<Record<string, number>>({});
    const [newSku, setNewSku] = useState({ code: "", name: "", category: "Snacks", threshold: 100 });
    const supabase = createClient();

    const refreshSkus = async () => {
        const { data } = await supabase.from("skus").select("*").order("code");
        if (data) setSkus(data);
    };

    const handleAddSku = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSku.code || !newSku.name) { toast.error("Code and name are required"); return; }
        startTransition(async () => {
            const { data: sku, error } = await supabase.from("skus").insert({
                code: newSku.code, name: newSku.name, category: newSku.category, low_stock_threshold: newSku.threshold,
            }).select().single();
            if (error) { toast.error(error.message); return; }
            if (sku) {
                await supabase.from("stock_levels").insert([
                    { sku_id: sku.id, pack_type: "30g_individual", quantity: 0 },
                    { sku_id: sku.id, pack_type: "pack_of_6", quantity: 0 },
                    { sku_id: sku.id, pack_type: "sample_200g", quantity: 0 },
                ]);
            }
            toast.success("SKU added");
            setShowForm(false);
            setNewSku({ code: "", name: "", category: "Snacks", threshold: 100 });
            await refreshSkus();
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
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="section-title">SKU Manager</h2>
                <button onClick={() => setShowForm(!showForm)} className="btn-pink text-sm py-2 px-4">
                    {showForm ? "Cancel" : "+ Add SKU"}
                </button>
            </div>

            {showForm && (
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
                {skus.map((sku) => (
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
                            </div>
                            <button onClick={() => handleToggleActive(sku)} disabled={isPending}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${sku.is_active ? "border-red-200 text-red-500 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                                {sku.is_active ? "Archive" : "Restore"}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
