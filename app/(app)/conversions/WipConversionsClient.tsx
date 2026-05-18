"use client";

import { useState, useTransition, useMemo } from "react";
import { SKU, PackTypeRecord, WipConversion, ConversionRecipe } from "@/lib/types";
import { createConversion, completeConversion, rejectConversion } from "@/lib/actions/conversions";
import toast from "react-hot-toast";

interface Props {
    skus: SKU[];
    packTypes: PackTypeRecord[];
    recipes: ConversionRecipe[];
    initialConversions: WipConversion[];
    role: string;
}

export default function WipConversionsClient({ skus, recipes, initialConversions, role }: Props) {
    const [conversions, setConversions] = useState<WipConversion[]>(initialConversions);
    const [showForm, setShowForm] = useState(false);
    const [recipeId, setRecipeId] = useState<string>(recipes[0]?.id ?? "");
    const [selectedSkuId, setSelectedSkuId] = useState<string>("");
    const [quantity, setQuantity] = useState<number>(1);
    const [rawQty, setRawQty] = useState<string>("1");
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [notes, setNotes] = useState("");
    const [isPending, startTransition] = useTransition();

    // ── Selected recipe object ──────────────────────────────────────────────
    const recipe = useMemo(
        () => recipes.find((r) => r.id === recipeId) ?? null,
        [recipeId, recipes]
    );

    // ── Preview: calculate what will be consumed/produced ──────────────────
    const preview = useMemo(() => {
        if (!recipe || quantity <= 0) return null;

        let inputs: { name: string; packType: string; qty: number }[] = [];

        if (recipe.is_assorted) {
            // Assorted: 1 of every active 30g SKU
            inputs = skus.map((s) => ({ name: s.name, packType: "30g_individual", qty: quantity }));
        } else if (recipe.ingredients && recipe.ingredients.length > 0) {
            inputs = recipe.ingredients.map((ing) => {
                const sku = ing.input_sku_id
                    ? skus.find((s) => s.id === ing.input_sku_id)
                    : skus.find((s) => s.id === selectedSkuId);
                return {
                    name: sku?.name ?? (ing.input_sku_id ? "Unknown SKU" : "— select flavour above —"),
                    packType: ing.input_pack_type,
                    qty: ing.qty_per_output_unit * quantity,
                };
            });
        }

        const outputSku = recipe.output_sku_id
            ? skus.find((s) => s.id === recipe.output_sku_id)
            : skus.find((s) => s.id === selectedSkuId);

        return {
            inputs,
            output: { name: outputSku?.name ?? "—", packType: recipe.output_pack_type, qty: quantity },
        };
    }, [recipe, quantity, selectedSkuId, skus]);

    // ── Needs SKU picker? (Single-flavour recipes with null ingredient SKU) ─
    const needsSkuPick = recipe
        ? !recipe.is_assorted && recipe.ingredients?.some((i) => i.input_sku_id === null)
        : false;

    // ── Submit ──────────────────────────────────────────────────────────────
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!recipe) { toast.error("Select a recipe"); return; }
        if (needsSkuPick && !selectedSkuId) { toast.error("Please select a flavour"); return; }

        startTransition(async () => {
            try {
                await createConversion({
                    recipeId: recipe.id,
                    selectedSkuId: needsSkuPick ? selectedSkuId : null,
                    quantity,
                    notes,
                    date,
                });
                toast.success("Conversion created — awaiting admin completion");
                setQuantity(1); setRawQty("1"); setNotes(""); setSelectedSkuId(""); setShowForm(false);

                // Refresh log
                const { createClient } = await import("@/lib/supabase/client");
                const sb = createClient();
                const { data } = await sb
                    .from("wip_conversions")
                    .select(`
                        *,
                        inputs:wip_conversion_inputs(*, sku:skus(*)),
                        outputs:wip_conversion_outputs(*, sku:skus(*)),
                        recipe:conversion_recipes(name)
                    `)
                    .order("created_at", { ascending: false })
                    .limit(50);
                if (data) setConversions(data as any);
            } catch (err: any) {
                toast.error(err.message);
            }
        });
    };

    // ── Admin actions ───────────────────────────────────────────────────────
    const handleComplete = (convId: string) => {
        startTransition(async () => {
            try {
                await completeConversion(convId);
                toast.success("✅ Stock updated successfully!");
                setConversions((prev) =>
                    prev.map((c) => c.id === convId ? { ...c, status: "completed" } : c)
                );
            } catch (err: any) {
                toast.error(err.message);
            }
        });
    };

    const handleReject = (convId: string) => {
        startTransition(async () => {
            try {
                await rejectConversion(convId);
                toast.success("Conversion rejected");
                setConversions((prev) =>
                    prev.map((c) => c.id === convId ? { ...c, status: "rejected" } : c)
                );
            } catch (err: any) {
                toast.error(err.message);
            }
        });
    };

    const packLabel = (name: string) =>
        ({ "30g_individual": "30g Indv.", "pack_of_6": "Pack of 6", "trio_pack": "Trio Pack", "sample_200g": "200g Sample" }[name] ?? name);

    // ────────────────────────────────────────────────────────────────────────
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="section-title">WIP Conversions</h2>
                <button onClick={() => setShowForm(!showForm)} className="btn-pink text-sm py-2 px-4">
                    {showForm ? "Cancel" : "+ New Run"}
                </button>
            </div>

            {/* ── Create form ─────────────────────────────────────────────── */}
            {showForm && (
                <form onSubmit={handleSubmit} className="card space-y-4">
                    <h3 className="font-serif text-lg text-brand-heading">New Production Run</h3>

                    {/* Step 1: Pick recipe */}
                    <div>
                        <label className="label">1. What are you making?</label>
                        <div className="flex gap-2 flex-wrap">
                            {recipes.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => { setRecipeId(r.id); setSelectedSkuId(""); }}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${recipeId === r.id
                                        ? "bg-brand-pink text-white border-brand-pink"
                                        : "bg-white text-brand-heading border-brand-border hover:border-brand-pink/40"}`}
                                >
                                    {r.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Flavour picker (only for single-flavour pack of 6) */}
                    {needsSkuPick && (
                        <div>
                            <label className="label">2. Which flavour?</label>
                            <select
                                value={selectedSkuId}
                                onChange={(e) => setSelectedSkuId(e.target.value)}
                                className="input"
                                required
                            >
                                <option value="" disabled>Select a flavour…</option>
                                {skus.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Step 3: Quantity */}
                    <div>
                        <label className="label">{needsSkuPick ? "3." : "2."} How many packs to produce?</label>
                        <div className="flex items-center gap-3">
                            <button type="button"
                                onClick={() => { const v = Math.max(1, quantity - 1); setQuantity(v); setRawQty(String(v)); }}
                                className="w-9 h-9 rounded-xl bg-gray-100 text-brand-heading font-bold text-lg flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-all">−</button>
                            <input
                                type="number"
                                min={1}
                                value={rawQty}
                                onChange={(e) => {
                                    setRawQty(e.target.value);
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v) && v >= 1) setQuantity(v);
                                }}
                                onBlur={() => {
                                    if (quantity < 1 || isNaN(quantity)) { setQuantity(1); setRawQty("1"); }
                                    else setRawQty(String(quantity));
                                }}
                                onFocus={(e) => e.target.select()}
                                className="w-20 text-center text-xl font-bold border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-brand-pink"
                            />
                            <button type="button"
                                onClick={() => { const v = quantity + 1; setQuantity(v); setRawQty(String(v)); }}
                                className="w-9 h-9 rounded-xl bg-brand-pink text-white font-bold text-lg flex items-center justify-center hover:bg-brand-hover active:scale-90 transition-all">+</button>
                        </div>
                    </div>

                    {/* Live preview card */}
                    {preview && (
                        <div className="rounded-xl border border-brand-border bg-gray-50 p-4 space-y-3">
                            <p className="text-xs font-semibold text-brand-text/40 uppercase tracking-wider">Preview</p>

                            {/* Inputs */}
                            <div>
                                <p className="text-xs text-brand-text/50 mb-1.5">📥 Stock to deduct</p>
                                <div className="space-y-1">
                                    {preview.inputs.map((inp, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm">
                                            <span className="text-brand-heading">{inp.name}</span>
                                            <span className="text-brand-text/60">
                                                {packLabel(inp.packType)} × <strong className="text-brand-heading">{inp.qty}</strong>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center gap-2">
                                <div className="flex-1 border-t border-dashed border-brand-border" />
                                <span className="text-brand-text/30 text-xs">produces</span>
                                <div className="flex-1 border-t border-dashed border-brand-border" />
                            </div>

                            {/* Output */}
                            <div>
                                <p className="text-xs text-brand-text/50 mb-1.5">📤 Stock to add</p>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-brand-heading font-semibold">{preview.output.name}</span>
                                    <span className="text-brand-pink font-semibold">
                                        {packLabel(preview.output.packType)} × <strong>{preview.output.qty}</strong>
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Date + Notes */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Date</label>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                        </div>
                        <div>
                            <label className="label">Notes</label>
                            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                                placeholder="Batch #, notes…" className="input" />
                        </div>
                    </div>

                    <button type="submit" disabled={isPending} className="btn-primary w-full">
                        {isPending ? "Saving…" : "Create Conversion"}
                    </button>
                </form>
            )}

            {/* ── Conversion log ───────────────────────────────────────────── */}
            <div>
                <h3 className="font-serif text-base text-brand-heading mb-3">Conversion Log</h3>
                {conversions.length === 0 ? (
                    <div className="card text-center py-8 text-brand-text/50 text-sm">No conversions yet</div>
                ) : (
                    <div className="space-y-3">
                        {conversions.map((conv) => (
                            <div key={conv.id} className="card space-y-3">
                                {/* Header row */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-brand-heading">
                                            {(conv as any).recipe?.name ?? "Conversion"}
                                        </p>
                                        <p className="text-xs text-brand-text/50">{conv.date} · {(conv as any).quantity ?? ""} unit{(conv as any).quantity !== 1 ? "s" : ""}</p>
                                    </div>
                                    <span className={`pill ${conv.status === "completed" ? "pill-approved" : conv.status === "rejected" ? "pill-rejected" : "pill-pending"}`}>
                                        {conv.status === "in_progress" ? "In Progress" : conv.status.charAt(0).toUpperCase() + conv.status.slice(1)}
                                    </span>
                                </div>

                                {/* Input ingredients */}
                                <div>
                                    <p className="text-[10px] font-semibold text-brand-text/40 uppercase tracking-wider mb-1">Consumed</p>
                                    <div className="space-y-0.5">
                                        {(conv.inputs ?? []).map((item) => (
                                            <div key={item.id} className="flex items-center justify-between text-sm">
                                                <span className="text-brand-text/80">{item.sku?.name ?? "—"}</span>
                                                <span className="text-brand-text/60">{packLabel(item.pack_type)} × <strong>{item.quantity}</strong></span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="text-center text-brand-text/30 text-[10px] tracking-widest">↓ PRODUCES ↓</div>

                                {/* Outputs */}
                                <div>
                                    <p className="text-[10px] font-semibold text-brand-text/40 uppercase tracking-wider mb-1">Produced</p>
                                    <div className="space-y-0.5">
                                        {(conv.outputs ?? []).map((item) => (
                                            <div key={item.id} className="flex items-center justify-between text-sm">
                                                <span className="font-semibold text-brand-heading">{item.sku?.name ?? "—"}</span>
                                                <span className="text-brand-pink font-semibold">{packLabel(item.pack_type)} × <strong>{item.quantity}</strong></span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {conv.notes && <p className="text-xs text-brand-text/50 italic">{conv.notes}</p>}

                                {/* Admin buttons */}
                                {role === "admin" && conv.status === "in_progress" && (
                                    <div className="flex gap-2 pt-1 border-t border-brand-border">
                                        <button onClick={() => handleComplete(conv.id)} disabled={isPending}
                                            className="flex-1 btn-primary text-sm py-2">
                                            ✅ Complete &amp; Update Stock
                                        </button>
                                        <button onClick={() => handleReject(conv.id)} disabled={isPending}
                                            className="btn-ghost text-sm py-2 px-3 text-brand-pink">
                                            Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
