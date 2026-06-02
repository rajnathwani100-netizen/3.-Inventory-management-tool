"use client";

import { useState, useTransition, useOptimistic } from "react";
import { approveEntry, rejectEntry, reverseEntry } from "@/lib/actions/approvals";
import toast from "react-hot-toast";

interface Props {
    initialPending: any[];
    initialHistory: any[];
    role: string;
}

type Tab = "pending" | "history";

const packLabel = (name: string) =>
    ({ "30g_individual": "30g Indv.", "pack_of_6": "Pack of 6", "trio_pack": "Trio Pack", "sample_200g": "200g Sample" }[name] ?? name);

export default function ApprovalsClient({ initialPending, initialHistory, role }: Props) {
    const [tab, setTab] = useState<Tab>("pending");
    const [pending, setPending] = useState(initialPending);
    const [history, setHistory] = useState(initialHistory);
    const [isPending, startTransition] = useTransition();

    // Optimistic removal for pending list
    const [optimisticPending, removePendingOptimistic] = useOptimistic(
        pending,
        (state, removedId: string) => state.filter((b) => b.id !== removedId)
    );

    // ── Refresh helpers ──────────────────────────────────────────────────────
    const refreshAll = async () => {
        const { createClient } = await import("@/lib/supabase/client");
        const sb = createClient();
        const sel = "*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name), approver:profiles!approved_by(name)";
        const [{ data: p }, { data: h }] = await Promise.all([
            sb.from("entry_batches").select(sel).eq("status", "pending").order("created_at", { ascending: true }),
            sb.from("entry_batches").select(sel).in("status", ["approved", "rejected"]).order("approved_at", { ascending: false }).limit(100),
        ]);
        if (p) setPending(p);
        if (h) setHistory(h);
    };

    // ── Approve ──────────────────────────────────────────────────────────────
    const handleApprove = (batchId: string) => {
        startTransition(async () => {
            removePendingOptimistic(batchId);
            try {
                const result = await approveEntry({ batchId });
                if (result.sheetsSyncFailed) {
                    toast("✅ Approved — Google Sheets sync failed", { icon: "⚠️" });
                } else {
                    toast.success("Entry approved & stock updated");
                }
                await refreshAll();
            } catch (err: any) {
                toast.error(err.message);
                await refreshAll();
            }
        });
    };

    // ── Reject ───────────────────────────────────────────────────────────────
    const handleReject = (batchId: string) => {
        startTransition(async () => {
            removePendingOptimistic(batchId);
            try {
                await rejectEntry({ batchId });
                toast.success("Entry rejected");
                await refreshAll();
            } catch (err: any) {
                toast.error(err.message);
                await refreshAll();
            }
        });
    };

    // ── Reverse ──────────────────────────────────────────────────────────────
    const handleReverse = (batchId: string, note: string) => {
        startTransition(async () => {
            try {
                await reverseEntry({ batchId, note });
                toast.success("✅ Entry reversed — stock has been restored");
                await refreshAll();
            } catch (err: any) {
                toast.error(err.message);
            }
        });
    };

    // ────────────────────────────────────────────────────────────────────────
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="section-title">Approvals</h2>
                {tab === "pending" && (
                    <span className="pill bg-brand-pink/10 text-brand-pink">{optimisticPending.length} pending</span>
                )}
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 bg-white rounded-xl p-1 border border-brand-border">
                {([["pending", "⏳ Pending"], ["history", "📋 History"]] as [Tab, string][]).map(([t, label]) => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${tab === t ? "bg-brand-pink text-white shadow-sm" : "text-brand-text/60 hover:text-brand-heading"}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ══════════════ PENDING TAB ══════════════ */}
            {tab === "pending" && (
                <>
                    {optimisticPending.length === 0 ? (
                        <div className="card text-center py-12">
                            <div className="text-4xl mb-3">✅</div>
                            <p className="font-serif text-lg text-brand-heading">All caught up!</p>
                            <p className="text-sm text-brand-text/50 mt-1">No entries awaiting approval</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {optimisticPending.map((batch: any) => (
                                <ApprovalCard key={batch.id} batch={batch}
                                    onApprove={handleApprove} onReject={handleReject} isPending={isPending} />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ══════════════ HISTORY TAB ══════════════ */}
            {tab === "history" && (
                <div className="space-y-3">
                    <p className="text-xs text-brand-text/50">{history.length} entries in history (last 100)</p>
                    {history.length === 0 ? (
                        <div className="card text-center py-8 text-brand-text/50 text-sm">No history yet</div>
                    ) : (
                        history.map((batch: any) => (
                            <HistoryCard key={batch.id} batch={batch}
                                onReverse={handleReverse} isPending={isPending} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ── Pending Approval Card ────────────────────────────────────────────────────
function ApprovalCard({ batch, onApprove, onReject, isPending }: {
    batch: any;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    isPending: boolean;
}) {
    const isInward = batch.direction === "inward";
    return (
        <div className="card space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`pill ${isInward ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-brand-pink"}`}>
                    {isInward ? "↓ Inward" : "↑ Outward"}
                </span>
                <span className="text-xs text-brand-text/50">{batch.date}</span>
                <span className="text-xs text-brand-text/50">·</span>
                <span className="text-xs font-medium text-brand-text/70">{packLabel(batch.pack_type)}</span>
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
                <button onClick={() => onReject(batch.id)} disabled={isPending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                    Reject
                </button>
                <button onClick={() => onApprove(batch.id)} disabled={isPending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50">
                    Approve
                </button>
            </div>
        </div>
    );
}

// ── History Card ─────────────────────────────────────────────────────────────
function HistoryCard({ batch, onReverse, isPending }: {
    batch: any;
    onReverse: (id: string, note: string) => void;
    isPending: boolean;
}) {
    const [showReverseModal, setShowReverseModal] = useState(false);
    const [reverseNote, setReverseNote] = useState("");

    const isInward = batch.direction === "inward";
    const isReversed = batch.is_reversed;
    const isReversal = !!batch.reversal_of;

    const handleConfirmReverse = () => {
        onReverse(batch.id, reverseNote);
        setShowReverseModal(false);
        setReverseNote("");
    };

    return (
        <div className={`card space-y-2.5 ${isReversed ? "opacity-60" : ""} ${isReversal ? "border-dashed border-amber-300" : ""}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`pill text-xs ${isInward ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-brand-pink"}`}>
                        {isInward ? "↓ Inward" : "↑ Outward"}
                    </span>
                    {/* Status badge */}
                    {batch.status === "approved" && !isReversed && !isReversal && (
                        <span className="pill bg-green-100 text-green-700 text-xs">✅ Approved</span>
                    )}
                    {batch.status === "rejected" && (
                        <span className="pill bg-red-100 text-red-600 text-xs">✗ Rejected</span>
                    )}
                    {isReversed && (
                        <span className="pill bg-gray-100 text-gray-500 text-xs">↩ Reversed</span>
                    )}
                    {isReversal && (
                        <span className="pill bg-amber-100 text-amber-700 text-xs">↩ Reversal Entry</span>
                    )}
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-brand-text/50">{batch.date}</p>
                    <p className="text-xs text-brand-text/40">{packLabel(batch.pack_type)}</p>
                </div>
            </div>

            {/* Items */}
            <div className="space-y-1">
                {(batch.batch_items || []).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between py-1 px-2.5 bg-brand-bg rounded-lg">
                        <span className="text-sm font-semibold text-brand-heading">{item.sku?.name ?? "—"}</span>
                        <span className={`text-sm font-bold ${isInward ? "text-blue-700" : "text-brand-pink"}`}>
                            {isInward ? "+" : "−"}{item.quantity}
                        </span>
                    </div>
                ))}
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-brand-text/50">
                <span>📝 {batch.reason}</span>
                {batch.notes && <span>· {batch.notes}</span>}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-brand-text/40">
                <span>Submitted by: {batch.submitter?.name ?? "Unknown"}</span>
                {batch.approver?.name && <span>· {batch.status === "approved" ? "Approved" : "Rejected"} by: {batch.approver.name}</span>}
                {batch.approved_at && (
                    <span>· {new Date(batch.approved_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                )}
            </div>

            {/* Reverse info if already reversed */}
            {isReversed && batch.reversed_at && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
                    ↩ Reversed on {new Date(batch.reversed_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {batch.reversal_note && <span> — "{batch.reversal_note}"</span>}
                </div>
            )}

            {/* Reverse button — only for approved, non-reversed, non-reversal entries */}
            {batch.status === "approved" && !isReversed && !isReversal && (
                <div className="pt-1 border-t border-brand-border">
                    <button
                        onClick={() => setShowReverseModal(true)}
                        disabled={isPending}
                        className="w-full py-2 rounded-xl text-xs font-semibold border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50">
                        ↩ Reverse This Entry (undo stock effect)
                    </button>
                </div>
            )}

            {/* Reverse Confirmation Modal */}
            {showReverseModal && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6" onClick={() => setShowReverseModal(false)}>
                    <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div>
                            <h3 className="font-serif text-lg text-brand-heading">Reverse This Entry?</h3>
                            <p className="text-xs text-brand-text/60 mt-1">
                                This will run the <strong>opposite stock movement</strong> and mark this entry as reversed.
                                The original entry stays in the audit log — nothing is deleted.
                            </p>
                        </div>

                        {/* What will happen */}
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-1">
                            <p className="text-xs font-semibold text-amber-800 mb-1.5">What will happen:</p>
                            {(batch.batch_items || []).map((item: any) => (
                                <div key={item.id} className="flex justify-between text-xs text-amber-900">
                                    <span>{item.sku?.name}</span>
                                    <span className="font-bold">
                                        {isInward ? `−${item.quantity}` : `+${item.quantity}`} units
                                    </span>
                                </div>
                            ))}
                            <p className="text-xs text-amber-700 mt-1.5 pt-1.5 border-t border-amber-200">
                                Pack type: <strong>{packLabel(batch.pack_type)}</strong>
                            </p>
                        </div>

                        <div>
                            <label className="label text-xs">Reason for reversal (optional)</label>
                            <input
                                type="text"
                                value={reverseNote}
                                onChange={(e) => setReverseNote(e.target.value)}
                                placeholder="e.g. Entry approved by mistake"
                                className="input text-sm"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setShowReverseModal(false)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-brand-border text-brand-text/60 hover:bg-gray-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleConfirmReverse} disabled={isPending}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50">
                                {isPending ? "Reversing…" : "Confirm Reversal"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
