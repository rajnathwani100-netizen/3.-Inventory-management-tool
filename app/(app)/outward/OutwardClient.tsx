"use client";

import { useState, useTransition, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { SKU, PackTypeRecord, OUTWARD_REASONS } from "@/lib/types";
import BatchSkuPicker from "@/components/forms/BatchSkuPicker";
import ReasonPicker from "@/components/forms/ReasonPicker";
import { submitBatchEntry } from "@/lib/actions/inward";
import { generateCSV, formatDateForFilename } from "@/lib/utils/csv";
import toast from "react-hot-toast";

interface Props {
    skus: SKU[];
    initialBatches: any[];
    packTypes: PackTypeRecord[];
}

export default function OutwardClient({ skus: initialSkus, initialBatches, packTypes }: Props) {
    const [skus, setSkus] = useState<SKU[]>(initialSkus);
    const [packType, setPackType] = useState<string>(packTypes[0]?.name ?? "30g_individual");
    const [reason, setReason] = useState("");
    const [items, setItems] = useState<{ skuId: string; quantity: number }[]>([]);
    const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [notes, setNotes] = useState("");
    const [batches, setBatches] = useState(initialBatches);
    const [isPending, startTransition] = useTransition();
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        supabase.from("skus").select("*").eq("is_active", true).order("code")
            .then(({ data }) => { if (data && data.length > 0) setSkus(data); });
    }, []);

    const packTypeLabel = (name: string) =>
        packTypes.find((pt) => pt.name === name)?.label ?? name;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const actualReason = reason === "__custom__" ? "" : reason;
        if (!actualReason) { toast.error("Please select or enter a reason"); return; }
        if (items.length === 0) { toast.error("Select at least one SKU"); return; }

        startTransition(async () => {
            try {
                await submitBatchEntry({ direction: "outward", packType, reason: actualReason, notes, date, items });
                toast.success("Outward entry submitted for approval");
                setItems([]); setReason(""); setNotes(""); setShowForm(false);
                const supabase = createClient();
                const { data } = await supabase.from("entry_batches")
                    .select("*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name)")
                    .eq("direction", "outward")
                    .order("created_at", { ascending: false })
                    .limit(20);
                if (data) setBatches(data);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleExport = () => {
        const rows = batches.filter((b) => b.status === "approved").flatMap((b: any) =>
            (b.batch_items || []).map((item: any) => ({
                Date: b.date, "SKU Code": item.sku?.code ?? "", "SKU Name": item.sku?.name ?? "",
                "Pack Type": packTypeLabel(b.pack_type),
                Quantity: item.quantity, Reason: b.reason, Notes: b.notes ?? "",
                Status: b.status, "Submitted By": b.submitter?.name ?? "", "Approved Date": b.approved_at ?? "",
            }))
        );
        generateCSV(rows, `knacks_outward_${formatDateForFilename()}.csv`);
    };

    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="section-title">Outward Log</h2>
                <div className="flex gap-2">
                    <button onClick={handleExport} className="btn-ghost text-sm py-2 px-3">Export CSV</button>
                    <button onClick={() => setShowForm(!showForm)} className="btn-pink text-sm py-2 px-4">
                        {showForm ? "Cancel" : "+ New Entry"}
                    </button>
                </div>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="card space-y-5">
                    <h3 className="font-serif text-lg text-brand-heading">New Outward Entry</h3>
                    <div>
                        <label className="label">Pack Type</label>
                        <div className="flex gap-2 flex-wrap">
                            {packTypes.map((pt) => (
                                <button key={pt.name} type="button" onClick={() => setPackType(pt.name)}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${packType === pt.name ? "bg-brand-pink text-white border-brand-pink" : "bg-white text-brand-heading border-brand-border hover:border-brand-pink/40"}`}>
                                    {pt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <ReasonPicker reasons={OUTWARD_REASONS} value={reason} onChange={setReason} />
                    <BatchSkuPicker skus={skus} value={items} onChange={setItems} />
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Date</label>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                        </div>
                        <div>
                            <label className="label">Notes</label>
                            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Order ID, etc." className="input" />
                        </div>
                    </div>
                    <button type="submit" disabled={isPending} className="btn-primary w-full">
                        {isPending ? "Submitting..." : "Submit for Approval"}
                    </button>
                </form>
            )}

            <div>
                <h3 className="font-serif text-base text-brand-heading mb-3">Recent Entries</h3>
                {batches.length === 0 ? (
                    <div className="card text-center py-8 text-brand-text/50 text-sm">No outward entries yet</div>
                ) : (
                    <div className="space-y-2">
                        {batches.map((batch: any) => (
                            <div key={batch.id} className="card flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-brand-heading truncate">
                                        {(batch.batch_items || []).map((i: any) => `${i.sku?.name ?? "?"} ×${i.quantity}`).join(", ") || "—"}
                                    </p>
                                    <p className="text-xs text-brand-text/60 mt-0.5">
                                        {packTypeLabel(batch.pack_type)} · {batch.reason} · {batch.date}
                                    </p>
                                </div>
                                <span className={`pill pill-${batch.status} shrink-0`}>
                                    {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
