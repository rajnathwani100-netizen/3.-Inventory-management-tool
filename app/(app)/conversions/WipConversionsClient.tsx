"use client";

import { useState, useTransition, useMemo } from "react";
import { SKU, PackTypeRecord, WipConversion, ConversionRecipe } from "@/lib/types";
import {
    createConversion, completeConversion, rejectConversion,
    deleteConversion, updateRecipeIngredients
} from "@/lib/actions/conversions";
import toast from "react-hot-toast";

interface Props {
    skus: SKU[];
    packTypes: PackTypeRecord[];
    recipes: ConversionRecipe[];
    initialConversions: WipConversion[];
    role: string;
}

type Tab = "convert" | "history" | "recipes";

const packLabel = (name: string) =>
    ({ "30g_individual": "30g Indv.", "pack_of_6": "Pack of 6", "trio_pack": "Trio Pack", "sample_200g": "200g Sample" }[name] ?? name);

export default function WipConversionsClient({ skus, packTypes, recipes: initialRecipes, initialConversions, role }: Props) {
    const [tab, setTab] = useState<Tab>("convert");
    const [recipes, setRecipes] = useState<ConversionRecipe[]>(initialRecipes);
    const [conversions, setConversions] = useState<WipConversion[]>(initialConversions);
    const [isPending, startTransition] = useTransition();

    // ── Convert tab state ──────────────────────────────────────────────────
    const [showForm, setShowForm] = useState(false);
    const [recipeId, setRecipeId] = useState<string>(initialRecipes[0]?.id ?? "");
    const [selectedSkuId, setSelectedSkuId] = useState<string>("");
    const [quantity, setQuantity] = useState(1);
    const [rawQty, setRawQty] = useState("1");
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [notes, setNotes] = useState("");

    const recipe = useMemo(() => recipes.find((r) => r.id === recipeId) ?? null, [recipeId, recipes]);
    const needsSkuPick = useMemo(
        () => !!(recipe && recipe.ingredients?.some((i: any) => i.input_sku_id === null)),
        [recipe]
    );

    // Live preview of what will be consumed/produced
    const preview = useMemo(() => {
        if (!recipe || !recipe.ingredients?.length || quantity <= 0) return null;
        const inputs = (recipe.ingredients ?? []).map((ing: any) => {
            const sku = ing.input_sku_id
                ? skus.find((s) => s.id === ing.input_sku_id)
                : skus.find((s) => s.id === selectedSkuId);
            return { name: sku?.name ?? (needsSkuPick ? "— pick flavour above —" : "?"), packType: ing.input_pack_type, qty: ing.qty_per_output_unit * quantity };
        });
        const outSku = recipe.output_sku_id
            ? skus.find((s) => s.id === recipe.output_sku_id)
            : skus.find((s) => s.id === selectedSkuId);
        return { inputs, output: { name: outSku?.name ?? "—", packType: recipe.output_pack_type, qty: quantity } };
    }, [recipe, quantity, selectedSkuId, skus, needsSkuPick]);

    const refreshConversions = async () => {
        const { createClient } = await import("@/lib/supabase/client");
        const sb = createClient();
        const { data } = await sb
            .from("wip_conversions")
            .select("*, inputs:wip_conversion_inputs(*, sku:skus(*)), outputs:wip_conversion_outputs(*, sku:skus(*)), recipe:conversion_recipes(name)")
            .order("created_at", { ascending: false }).limit(50);
        if (data) setConversions(data as any);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!recipe) { toast.error("Select a recipe"); return; }
        if (recipe.ingredients?.length === 0) { toast.error("This recipe has no ingredients. Configure it in the Recipes tab."); return; }
        if (needsSkuPick && !selectedSkuId) { toast.error("Select a flavour"); return; }

        startTransition(async () => {
            try {
                await createConversion({ recipeId: recipe.id, selectedSkuId: needsSkuPick ? selectedSkuId : null, quantity, notes, date });
                toast.success("Conversion created — awaiting admin approval");
                setQuantity(1); setRawQty("1"); setNotes(""); setSelectedSkuId(""); setShowForm(false);
                await refreshConversions();
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleComplete = (convId: string) => {
        startTransition(async () => {
            try {
                await completeConversion(convId);
                toast.success("✅ Stock updated!");
                await refreshConversions();
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleReject = (convId: string) => {
        startTransition(async () => {
            try {
                await rejectConversion(convId);
                toast.success("Conversion rejected");
                await refreshConversions();
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleDelete = (convId: string) => {
        if (!window.confirm("Delete this conversion? This cannot be undone.")) return;
        startTransition(async () => {
            try {
                await deleteConversion(convId);
                toast.success("Deleted");
                setConversions((prev) => prev.filter((c) => c.id !== convId));
            } catch (err: any) { toast.error(err.message); }
        });
    };

    // ────────────────────────────────────────────────────────────────────────
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
            <h2 className="section-title">WIP Conversions</h2>

            {/* Tabs */}
            <div className="flex gap-1 bg-white rounded-xl p-1 border border-brand-border">
                {([["convert", "🔄 Convert"], ["history", "📋 History"], ...(role === "admin" ? [["recipes", "⚙️ Recipes"]] : [])] as [Tab, string][]).map(([t, label]) => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${tab === t ? "bg-brand-pink text-white shadow-sm" : "text-brand-text/60 hover:text-brand-heading"}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ══════════════════════════ CONVERT TAB ══════════════════════════ */}
            {tab === "convert" && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button onClick={() => setShowForm(!showForm)} className="btn-pink text-sm py-2 px-4">
                            {showForm ? "Cancel" : "+ New Run"}
                        </button>
                    </div>

                    {showForm && (
                        <form onSubmit={handleSubmit} className="card space-y-4">
                            <h3 className="font-serif text-lg text-brand-heading">New Production Run</h3>

                            {/* Step 1: Recipe */}
                            <div>
                                <label className="label">1. What are you making?</label>
                                {recipes.length === 0 ? (
                                    <p className="text-sm text-brand-text/50">No recipes configured. Go to the Recipes tab.</p>
                                ) : (
                                    <div className="flex gap-2 flex-wrap">
                                        {recipes.map((r) => (
                                            <button key={r.id} type="button"
                                                onClick={() => { setRecipeId(r.id); setSelectedSkuId(""); }}
                                                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${recipeId === r.id ? "bg-brand-pink text-white border-brand-pink" : "bg-white text-brand-heading border-brand-border hover:border-brand-pink/40"}`}>
                                                {r.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Step 2: Flavour (single-flavour only) */}
                            {needsSkuPick && (
                                <div>
                                    <label className="label">2. Which flavour?</label>
                                    <select value={selectedSkuId} onChange={(e) => setSelectedSkuId(e.target.value)} className="input" required>
                                        <option value="" disabled>Select a flavour…</option>
                                        {skus.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Step 3: Quantity */}
                            <div>
                                <label className="label">{needsSkuPick ? "3." : "2."} How many packs to produce?</label>
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={() => { const v = Math.max(1, quantity - 1); setQuantity(v); setRawQty(String(v)); }}
                                        className="w-9 h-9 rounded-xl bg-gray-100 text-brand-heading font-bold text-lg flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-all">−</button>
                                    <input type="number" min={1} value={rawQty}
                                        onChange={(e) => { setRawQty(e.target.value); const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1) setQuantity(v); }}
                                        onBlur={() => { if (!quantity || quantity < 1) { setQuantity(1); setRawQty("1"); } else setRawQty(String(quantity)); }}
                                        onFocus={(e) => e.target.select()}
                                        className="w-20 text-center text-xl font-bold border border-gray-200 rounded-xl py-2 focus:outline-none focus:border-brand-pink" />
                                    <button type="button" onClick={() => { const v = quantity + 1; setQuantity(v); setRawQty(String(v)); }}
                                        className="w-9 h-9 rounded-xl bg-brand-pink text-white font-bold text-lg flex items-center justify-center hover:bg-brand-hover active:scale-90 transition-all">+</button>
                                </div>
                            </div>

                            {/* Preview */}
                            {preview && recipe?.ingredients?.length ? (
                                <div className="rounded-xl border border-brand-border bg-gray-50 p-4 space-y-3">
                                    <p className="text-xs font-semibold text-brand-text/40 uppercase tracking-wider">Preview</p>
                                    <div>
                                        <p className="text-xs text-brand-text/50 mb-1.5">📥 Stock to deduct</p>
                                        <div className="space-y-1">
                                            {preview.inputs.map((inp, i) => (
                                                <div key={i} className="flex items-center justify-between text-sm">
                                                    <span className="text-brand-heading">{inp.name}</span>
                                                    <span className="text-brand-text/60">{packLabel(inp.packType)} × <strong className="text-brand-heading">{inp.qty}</strong></span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 border-t border-dashed border-brand-border" />
                                        <span className="text-brand-text/30 text-xs">produces</span>
                                        <div className="flex-1 border-t border-dashed border-brand-border" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-brand-text/50 mb-1.5">📤 Stock to add</p>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-brand-heading font-semibold">{preview.output.name}</span>
                                            <span className="text-brand-pink font-semibold">{packLabel(preview.output.packType)} × <strong>{preview.output.qty}</strong></span>
                                        </div>
                                    </div>
                                </div>
                            ) : recipe && !recipe.ingredients?.length ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                                    ⚠️ This recipe has no ingredients yet. Go to the <button type="button" className="underline font-semibold" onClick={() => setTab("recipes")}>Recipes tab</button> to configure it.
                                </div>
                            ) : null}

                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="label">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" /></div>
                                <div><label className="label">Notes</label><input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Batch #…" className="input" /></div>
                            </div>
                            <button type="submit" disabled={isPending} className="btn-primary w-full">
                                {isPending ? "Saving…" : "Create Conversion"}
                            </button>
                        </form>
                    )}

                    {/* Pending conversions for admin */}
                    <div>
                        <h3 className="font-serif text-base text-brand-heading mb-3">Pending Approval</h3>
                        {conversions.filter((c) => c.status === "in_progress").length === 0 ? (
                            <div className="card text-center py-6 text-brand-text/50 text-sm">No pending conversions</div>
                        ) : conversions.filter((c) => c.status === "in_progress").map((conv) => (
                            <ConversionCard key={conv.id} conv={conv} role={role} isPending={isPending}
                                onComplete={handleComplete} onReject={handleReject} onDelete={handleDelete} />
                        ))}
                    </div>
                </div>
            )}

            {/* ══════════════════════════ HISTORY TAB ══════════════════════════ */}
            {tab === "history" && (
                <div className="space-y-3">
                    <p className="text-xs text-brand-text/50">{conversions.length} total conversions</p>
                    {conversions.length === 0 ? (
                        <div className="card text-center py-8 text-brand-text/50 text-sm">No conversions yet</div>
                    ) : conversions.map((conv) => (
                        <ConversionCard key={conv.id} conv={conv} role={role} isPending={isPending}
                            onComplete={handleComplete} onReject={handleReject} onDelete={handleDelete} />
                    ))}
                </div>
            )}

            {/* ══════════════════════════ RECIPES TAB (admin only) ══════════════════════════ */}
            {tab === "recipes" && role === "admin" && (
                <RecipesManager
                    recipes={recipes}
                    skus={skus}
                    packTypes={packTypes}
                    isPending={isPending}
                    startTransition={startTransition}
                    onRecipesChange={setRecipes}
                />
            )}
        </div>
    );
}

// ── Conversion Card ─────────────────────────────────────────────────────────
function ConversionCard({ conv, role, isPending, onComplete, onReject, onDelete }: {
    conv: WipConversion; role: string; isPending: boolean;
    onComplete: (id: string) => void; onReject: (id: string) => void; onDelete: (id: string) => void;
}) {
    return (
        <div className="card space-y-2 mb-2">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-brand-heading">{(conv as any).recipe?.name ?? "Conversion"}</p>
                    <p className="text-xs text-brand-text/50">{conv.date} · {(conv as any).quantity ?? ""} unit{(conv as any).quantity !== 1 ? "s" : ""}</p>
                </div>
                <span className={`pill ${conv.status === "completed" ? "pill-approved" : conv.status === "rejected" ? "pill-rejected" : "pill-pending"}`}>
                    {conv.status === "in_progress" ? "Pending" : conv.status.charAt(0).toUpperCase() + conv.status.slice(1)}
                </span>
            </div>
            <div>
                <p className="text-[10px] font-semibold text-brand-text/40 uppercase tracking-wider mb-0.5">Consumed</p>
                {(conv.inputs ?? []).map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-brand-text/80">{item.sku?.name ?? "—"}</span>
                        <span className="text-brand-text/60">{packLabel(item.pack_type)} × <strong>{item.quantity}</strong></span>
                    </div>
                ))}
            </div>
            <div className="text-center text-brand-text/30 text-[10px] tracking-widest">↓ PRODUCES ↓</div>
            <div>
                <p className="text-[10px] font-semibold text-brand-text/40 uppercase tracking-wider mb-0.5">Produced</p>
                {(conv.outputs ?? []).map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                        <span className="font-semibold text-brand-heading">{item.sku?.name ?? "—"}</span>
                        <span className="text-brand-pink font-semibold">{packLabel(item.pack_type)} × <strong>{item.quantity}</strong></span>
                    </div>
                ))}
            </div>
            {conv.notes && <p className="text-xs text-brand-text/50 italic">{conv.notes}</p>}
            {role === "admin" && conv.status === "in_progress" && (
                <div className="flex gap-2 pt-1 border-t border-brand-border">
                    <button onClick={() => onComplete(conv.id)} disabled={isPending} className="flex-1 btn-primary text-sm py-1.5">✅ Complete & Update Stock</button>
                    <button onClick={() => onReject(conv.id)} disabled={isPending} className="btn-ghost text-sm py-1.5 px-3 text-amber-600">Reject</button>
                    <button onClick={() => onDelete(conv.id)} disabled={isPending} className="btn-ghost text-sm py-1.5 px-3 text-red-500">Delete</button>
                </div>
            )}
            {role === "admin" && conv.status !== "in_progress" && (
                <div className="flex justify-end pt-1 border-t border-brand-border">
                    <button onClick={() => onDelete(conv.id)} disabled={isPending || conv.status === "completed"} className="btn-ghost text-xs py-1 px-2 text-red-400 disabled:opacity-30">
                        {conv.status === "completed" ? "🔒 Completed — cannot delete" : "Delete"}
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Recipes Manager (admin only) ─────────────────────────────────────────────
function RecipesManager({ recipes, skus, packTypes, isPending, startTransition, onRecipesChange }: {
    recipes: ConversionRecipe[]; skus: SKU[]; packTypes: PackTypeRecord[];
    isPending: boolean; startTransition: any; onRecipesChange: (r: ConversionRecipe[]) => void;
}) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftIngredients, setDraftIngredients] = useState<{ skuId: string | null; packType: string; qtyPerUnit: number }[]>([]);
    const [draftOutputSkuId, setDraftOutputSkuId] = useState<string>("");

    const startEdit = (recipe: ConversionRecipe) => {
        setEditingId(recipe.id);
        setDraftOutputSkuId(recipe.output_sku_id ?? "");
        setDraftIngredients(
            (recipe.ingredients ?? []).map((i: any) => ({
                skuId: i.input_sku_id,
                packType: i.input_pack_type,
                qtyPerUnit: i.qty_per_output_unit,
            }))
        );
    };

    const addIngredient = () =>
        setDraftIngredients((prev) => [...prev, { skuId: "", packType: "30g_individual", qtyPerUnit: 1 }]);

    const removeIngredient = (idx: number) =>
        setDraftIngredients((prev) => prev.filter((_, i) => i !== idx));

    const updateIngredient = (idx: number, field: string, value: any) =>
        setDraftIngredients((prev) => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing));

    const saveRecipe = (recipeId: string) => {
        startTransition(async () => {
            try {
                await updateRecipeIngredients(
                    recipeId,
                    draftIngredients.map((i) => ({ skuId: i.skuId || null, packType: i.packType, qtyPerUnit: i.qtyPerUnit })),
                    draftOutputSkuId || null
                );
                toast.success("Recipe saved!");
                setEditingId(null);
                // Refresh recipes in parent
                const { createClient } = await import("@/lib/supabase/client");
                const sb = createClient();
                const { data } = await sb.from("conversion_recipes")
                    .select("*, ingredients:conversion_recipe_ingredients(*, sku:skus(*))").eq("is_active", true).order("sort_order");
                if (data) onRecipesChange(data as any);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    return (
        <div className="space-y-4">
            <p className="text-xs text-brand-text/50">Configure which SKUs go into each recipe. Changes take effect on the next conversion.</p>
            {recipes.map((recipe) => (
                <div key={recipe.id} className="card space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-brand-heading text-sm">{recipe.name}</p>
                            <p className="text-xs text-brand-text/50">Output: {packLabel(recipe.output_pack_type)}</p>
                        </div>
                        {editingId !== recipe.id ? (
                            <button onClick={() => startEdit(recipe)} className="btn-ghost text-xs py-1.5 px-3">Edit</button>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={() => saveRecipe(recipe.id)} disabled={isPending} className="btn-primary text-xs py-1.5 px-3">Save</button>
                                <button onClick={() => setEditingId(null)} className="btn-ghost text-xs py-1.5 px-3">Cancel</button>
                            </div>
                        )}
                    </div>

                    {editingId === recipe.id ? (
                        <div className="space-y-3">
                            {/* Output SKU */}
                            <div>
                                <label className="label text-xs">Output SKU (what gets produced)</label>
                                <select value={draftOutputSkuId} onChange={(e) => setDraftOutputSkuId(e.target.value)} className="input text-sm">
                                    <option value="">— None (use user-selected flavour) —</option>
                                    {skus.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            {/* Ingredients */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="label text-xs mb-0">Ingredients (consumed per 1 output unit)</label>
                                    <button type="button" onClick={addIngredient} className="text-xs text-brand-pink font-semibold">+ Add</button>
                                </div>
                                <div className="space-y-2">
                                    {draftIngredients.map((ing, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <select value={ing.skuId ?? ""} onChange={(e) => updateIngredient(idx, "skuId", e.target.value || null)} className="input flex-1 text-sm py-1.5">
                                                <option value="">— Same as selected flavour —</option>
                                                {skus.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                            <select value={ing.packType} onChange={(e) => updateIngredient(idx, "packType", e.target.value)} className="input text-sm py-1.5 w-28 shrink-0">
                                                {packTypes.map((pt) => <option key={pt.name} value={pt.name}>{pt.label}</option>)}
                                            </select>
                                            <input type="number" min={1} value={ing.qtyPerUnit}
                                                onChange={(e) => updateIngredient(idx, "qtyPerUnit", parseInt(e.target.value, 10) || 1)}
                                                className="input w-14 text-center text-sm font-bold py-1.5 shrink-0" />
                                            <button type="button" onClick={() => removeIngredient(idx)}
                                                className="w-7 h-7 rounded-lg bg-gray-100 text-red-400 font-bold text-sm flex items-center justify-center hover:bg-red-50 transition-all shrink-0">×</button>
                                        </div>
                                    ))}
                                    {draftIngredients.length === 0 && (
                                        <p className="text-xs text-brand-text/40 italic">No ingredients — click + Add above</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Read-only view
                        <div className="space-y-1">
                            {recipe.output_sku_id && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-brand-text/50">Output SKU:</span>
                                    <span className="font-medium text-brand-pink">{skus.find((s) => s.id === recipe.output_sku_id)?.name ?? "—"}</span>
                                </div>
                            )}
                            {(recipe.ingredients ?? []).length === 0 ? (
                                <p className="text-xs text-amber-600 italic">⚠️ No ingredients configured</p>
                            ) : (recipe.ingredients ?? []).map((ing: any, i: number) => (
                                <div key={i} className="flex justify-between text-xs">
                                    <span className="text-brand-text/70">{ing.sku?.name ?? "Same as selected flavour"}</span>
                                    <span className="text-brand-text/60">{packLabel(ing.input_pack_type)} × {ing.qty_per_output_unit}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
