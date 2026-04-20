import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AnalyticsClient from "./AnalyticsClient";
import { format, subDays } from "date-fns";

export default async function AnalyticsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: outwardBatches } = await supabase
        .from("entry_batches")
        .select("reason, batch_items(quantity)")
        .eq("direction", "outward")
        .eq("status", "approved");

    const reasonMap: Record<string, number> = {};
    for (const b of outwardBatches ?? []) {
        const total = (b.batch_items as any[] || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);
        reasonMap[b.reason] = (reasonMap[b.reason] ?? 0) + total;
    }
    const outwardByReason = Object.entries(reasonMap).map(([reason, count]) => ({ reason, count }));

    const { data: stock30g } = await supabase
        .from("stock_levels")
        .select("quantity, sku:skus(name, low_stock_threshold)")
        .eq("pack_type", "30g_individual");

    const stockBySku = (stock30g ?? []).map((s: any) => ({
        name: s.sku?.name?.replace("Knacks ", "").slice(0, 14) ?? "?",
        qty: s.quantity,
        threshold: s.sku?.low_stock_threshold ?? 100,
    }));

    const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = subDays(new Date(), 6 - i);
        return format(d, "yyyy-MM-dd");
    });

    const { data: approvedBatches } = await supabase
        .from("entry_batches")
        .select("direction, date, batch_items(quantity)")
        .eq("status", "approved")
        .gte("date", last7[0]);

    const dayMap: Record<string, { inward: number; outward: number }> = {};
    for (const d of last7) dayMap[d] = { inward: 0, outward: 0 };
    for (const b of approvedBatches ?? []) {
        if (!dayMap[b.date]) continue;
        const total = (b.batch_items as any[] || []).reduce((s: number, i: any) => s + i.quantity, 0);
        dayMap[b.date][b.direction as "inward" | "outward"] += total;
    }
    const weeklyMovement = last7.map((d) => ({
        date: format(new Date(d + "T00:00:00"), "MMM d"),
        ...dayMap[d],
    }));

    const { data: closedStalls } = await supabase
        .from("stall_sessions")
        .select("name, stall_items(dispatched, returned, sold)")
        .eq("status", "closed");

    const stallSellThrough = (closedStalls ?? []).map((s: any) => {
        const items: any[] = s.stall_items || [];
        const totalDispatched = items.reduce((sum, i) => sum + i.dispatched, 0);
        const totalSold = items.reduce((sum, i) => sum + (i.sold ?? 0), 0);
        const pct = totalDispatched > 0 ? Math.round((totalSold / totalDispatched) * 100) : 0;
        return { name: s.name.slice(0, 12), pct };
    });

    return (
        <AnalyticsClient
            data={{ outwardByReason, stockBySku, weeklyMovement, stallSellThrough }}
        />
    );
}
