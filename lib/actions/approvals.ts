"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { syncToSheets } from "./sheets";

interface ApproveEntryParams { batchId: string; }
interface RejectEntryParams { batchId: string; }
interface ReverseEntryParams { batchId: string; note?: string; }

export async function approveEntry({ batchId }: ApproveEntryParams) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data: profile } = await supabase.from("profiles").select("role, name").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Admin access required");

    const { data: batch, error: batchError } = await serviceSupabase
        .from("entry_batches").select("*, batch_items(*, sku:skus(*))").eq("id", batchId).single();
    if (batchError || !batch) throw new Error("Batch not found");
    if (batch.status !== "pending") throw new Error("Batch already processed");

    for (const item of batch.batch_items || []) {
        const { data: existing } = await serviceSupabase
            .from("stock_levels").select("quantity, id")
            .eq("sku_id", item.sku_id).eq("pack_type", batch.pack_type).single();
        const currentQty = existing?.quantity ?? 0;
        const newQty = batch.direction === "inward" ? currentQty + item.quantity : currentQty - item.quantity;
        if (newQty < 0 && batch.direction === "outward") {
            throw new Error(`Insufficient stock for ${item.sku?.name ?? item.sku_id}. Current: ${currentQty}, Requested: ${item.quantity}`);
        }
        if (existing) {
            await serviceSupabase.from("stock_levels").update({ quantity: newQty, updated_at: new Date().toISOString() }).eq("id", existing.id);
        } else {
            await serviceSupabase.from("stock_levels").insert({ sku_id: item.sku_id, pack_type: batch.pack_type, quantity: newQty });
        }
    }

    await serviceSupabase.from("entry_batches").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", batchId);

    let sheetsSyncFailed = false;
    try { await syncToSheets(batch, profile?.name ?? user.email ?? "Unknown"); }
    catch (err) { console.error("Sheets sync failed:", err); sheetsSyncFailed = true; }

    revalidatePath("/approvals");
    revalidatePath("/inventory");
    return { success: true, sheetsSyncFailed };
}

export async function rejectEntry({ batchId }: RejectEntryParams) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Admin access required");
    await serviceSupabase.from("entry_batches").update({ status: "rejected", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", batchId);
    revalidatePath("/approvals");
    return { success: true };
}

// reverseEntry — RETURNS {success, error} instead of throwing.
// Next.js 14 production swallows thrown server action errors and shows
// "Server Components render" error instead of propagating to client try/catch.
// Returning an error object bypasses this bug entirely.
// Safe order: DB records created FIRST, stock updated LAST.
export async function reverseEntry({ batchId, note }: ReverseEntryParams): Promise<{ success: boolean; error?: string; reversalBatchId?: string }> {
    try {
        const supabase = await createClient();
        const serviceSupabase = await createServiceClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Not authenticated" };

        const { data: profile } = await supabase.from("profiles").select("role, name").eq("id", user.id).single();
        if (profile?.role !== "admin") return { success: false, error: "Admin access required" };

        const { data: batch, error: batchError } = await serviceSupabase
            .from("entry_batches").select("*, batch_items(*, sku:skus(*))").eq("id", batchId).single();
        if (batchError || !batch) return { success: false, error: "Batch not found" };
        if (batch.status !== "approved") return { success: false, error: "Can only reverse an approved entry" };

        const reversalDirection = batch.direction === "inward" ? "outward" : "inward";

        // Pre-flight: check stock won't go negative
        for (const item of batch.batch_items || []) {
            if (reversalDirection === "outward") {
                const { data: stock } = await serviceSupabase
                    .from("stock_levels").select("quantity").eq("sku_id", item.sku_id).eq("pack_type", batch.pack_type).maybeSingle();
                const available = stock?.quantity ?? 0;
                if (available < item.quantity) {
                    return {
                        success: false,
                        error: `Cannot reverse: "${item.sku?.name}" only has ${available} units but needs to deduct ${item.quantity}. Create an inward entry first to restore the stock, then reverse.`,
                    };
                }
            }
        }

        // STEP 1: Create counter-batch record (no new DB columns used)
        const { data: reversalBatch, error: revBatchErr } = await serviceSupabase
            .from("entry_batches")
            .insert({
                direction: reversalDirection,
                pack_type: batch.pack_type,
                reason: note ? `REVERSAL: ${note}` : `REVERSAL of ${batch.direction} entry from ${batch.date}`,
                notes: `Reversal of batch ${batchId.slice(0, 8)}`,
                date: new Date().toISOString().split("T")[0],
                status: "approved",
                submitted_by: user.id,
                approved_by: user.id,
                approved_at: new Date().toISOString(),
            })
            .select().single();
        if (revBatchErr || !reversalBatch) return { success: false, error: "Failed to create reversal record: " + (revBatchErr?.message ?? "unknown") };

        // STEP 2: Copy items to reversal batch
        const reversalItems = (batch.batch_items || []).map((item: any) => ({ batch_id: reversalBatch.id, sku_id: item.sku_id, quantity: item.quantity }));
        if (reversalItems.length > 0) {
            const { error: itemsErr } = await serviceSupabase.from("batch_items").insert(reversalItems);
            if (itemsErr) return { success: false, error: "Failed to copy items: " + itemsErr.message };
        }

        // STEP 3: Update stock (only reached if all DB writes above succeeded)
        for (const item of batch.batch_items || []) {
            const { data: existing } = await serviceSupabase
                .from("stock_levels").select("quantity, id").eq("sku_id", item.sku_id).eq("pack_type", batch.pack_type).maybeSingle();
            const currentQty = existing?.quantity ?? 0;
            const newQty = reversalDirection === "inward" ? currentQty + item.quantity : currentQty - item.quantity;
            if (existing) {
                await serviceSupabase.from("stock_levels").update({ quantity: newQty, updated_at: new Date().toISOString() }).eq("id", existing.id);
            } else {
                await serviceSupabase.from("stock_levels").insert({ sku_id: item.sku_id, pack_type: batch.pack_type, quantity: newQty });
            }
        }

        // STEP 4: Mark original as reversed (requires migration 006 — silent fail if not run)
        try {
            await serviceSupabase.from("entry_batches").update({ is_reversed: true, reversed_by: user.id, reversed_at: new Date().toISOString(), reversal_note: note || null }).eq("id", batchId);
        } catch { /* migration 006 not run yet — safe to ignore */ }

        revalidatePath("/approvals");
        revalidatePath("/inventory");
        return { success: true, reversalBatchId: reversalBatch.id };

    } catch (err: any) {
        return { success: false, error: err?.message ?? "Unknown error" };
    }
}
