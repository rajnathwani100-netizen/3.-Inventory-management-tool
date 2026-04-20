"use client";

import { useState, useTransition, useOptimistic } from "react";
import { PACK_TYPE_LABELS, PackType } from "@/lib/types";
import { approveEntry, rejectEntry } from "@/lib/actions/approvals";
import toast from "react-hot-toast";

interface Props {
    initialBatches: any[];
}

export default function ApprovalsClient({ initialBatches }: Props) {
    const [batches, setBatches] = useState(initialBatches);
    const [optimisticBatches, removeOptimistic] = useOptimistic(
        batches,
        (state, removedId: string) => state.filter((b) => b.id !== removedId)
    );
    const [isPending, startTransition] = useTransition();

    const handleApprove = (batchId: string) => {
        startTransition(async () => {
            removeOptimistic(batchId);
            try {
                const result = await approveEntry({ batchId });
                if (result.sheetsSyncFailed) {
                    toast("✅ Approved — Google Sheets sync failed (check logs)", { icon: "⚠️" });
                } else {
                    toast.success("Entry approved & stock updated");
                }
                setBatches((prev) => prev.filter((b) => b.id !== batchId));
            } catch (err: any) {
                toast.error(err.message);
                setBatches(initialBatches);
            }
        });
    };

    const handleReject = (batchId: string) => {
        startTransition(async () => {
            removeOptimistic(batchId);
            try {
                await rejectEntry({ batchId });
                toast.success("Entry rejected");
                setBatches((prev) => prev.filter((b) => b.id !== batchId));
            } catch (err: any) {
                toast.error(err.message);
                setBatches(initialBatches);
            }
        });
    };

    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="section-title">Approvals</h2>
                <span className="pill bg-brand-pink/10 text-brand-pink">{optimisticBatches.length} pending</span>
            </div>

            {optimisticBatches.length === 0 ? (
                <div className="card text-center py-12">
                    <div className="text-4xl mb-3">✅</div>
                    <p className="font-serif text-lg text-brand-heading">All caught up!</p>
                    <p className="text-sm text-brand-text/50 mt-1">No entries awaiting approval</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {optimisticBatches.map((batch: any) => (
                        <ApprovalCard key={batch.id} batch={batch} onApprove={handleApprove} onReject={handleReject} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ApprovalCard({ batch, onApprove, onReject }: { batch: any; onApprove: (id: string) => void; onReject: (id: string) => void }) {
    const isInward = batch.direction === "inward";
    return (
        <div className="card space-y-3">
            <div className="flex items-center gap-2">
                <span className={`pill ${isInward ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-brand-pink"}`}>
                    {isInward ? "↓ Inward" : "↑ Outward"}
                </span>
                <span className="text-xs text-brand-text/50">{batch.date}</span>
                <span className="text-xs text-brand-text/50">·</span>
                <span className="text-xs text-brand-text/50">{PACK_TYPE_LABELS[batch.pack_type as PackType] ?? batch.pack_type}</span>
                <span className="ml-auto text-xs text-brand-text/40">by {batch.submitter?.name ?? "Unknown"}</span>
            </div>

            <div className="space-y-1.5">
                {(batch.batch_items || []).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between py-1.5 px-3 bg-brand-bg rounded-lg">
                        <div>
                            <p className="text-sm font-semibold text-brand-heading">{item.sku?.name ?? "Unknown SKU"}</p>
                            <p className="text-xs text-brand-text/50">{item.sku?.code}</p>
                        </div>
                        <p className="text-base font-bold text-brand-heading">×{item.quantity}</p>
                    </div>
                ))}
            </div>

            <div className="text-sm text-brand-text/70">
                <span className="font-medium">Reason:</span> {batch.reason}
                {batch.notes && <span> · {batch.notes}</span>}
            </div>

            <div className="flex gap-2 pt-1">
                <button onClick={() => onReject(batch.id)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    Reject
                </button>
                <button onClick={() => onApprove(batch.id)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors">
                    Approve
                </button>
            </div>
        </div>
    );
}
