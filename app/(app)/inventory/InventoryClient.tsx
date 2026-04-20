"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { SKU, PackTypeRecord } from "@/lib/types";
import { getStockStatus, getStockPercentage, groupStockBySku, countLowStockSkus } from "@/lib/utils/stock";

interface Props {
    initialSkus: SKU[];
    initialStockLevels: any[];
    packTypes: PackTypeRecord[];
}

export default function InventoryClient({ initialSkus, initialStockLevels, packTypes }: Props) {
    const [skus] = useState<SKU[]>(initialSkus);
    const [stockLevels, setStockLevels] = useState<any[]>(initialStockLevels);
    const [activeTab, setActiveTab] = useState<string>(packTypes[0]?.name ?? "30g_individual");
    const supabase = createClient();

    useEffect(() => {
        const channel = supabase
            .channel("stock-realtime")
            .on("postgres_changes", { event: "*", schema: "public", table: "stock_levels" }, async () => {
                const { data } = await supabase.from("stock_levels").select("*, sku:skus(*)");
                if (data) setStockLevels(data);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    const stockMap = groupStockBySku(stockLevels);
    const lowStockCount = countLowStockSkus(skus, stockMap);
    const lowStockSkus = skus.filter((sku) => {
        const stock = stockMap[sku.id];
        return !stock || (stock["30g_individual"] ?? 0) < sku.low_stock_threshold;
    });

    return (
        <div className="px-4 py-5 max-w-2xl mx-auto">
            <h2 className="section-title mb-4">Live Inventory</h2>

            <div className="grid grid-cols-2 gap-3 mb-5">
                {packTypes.slice(0, 3).map((pt) => {
                    const total = Object.values(stockMap).reduce((sum, s) => sum + (s[pt.name] ?? 0), 0);
                    return <MetricCard key={pt.name} label={pt.label} value={total.toLocaleString()} icon="📦" />;
                })}
                <MetricCard label="Low Stock SKUs" value={lowStockCount} icon="⚠️" alert={lowStockCount > 0} />
            </div>

            <div className="flex gap-1 bg-white rounded-xl p-1 border border-brand-border mb-4">
                {packTypes.map((pt) => (
                    <button
                        key={pt.name}
                        onClick={() => setActiveTab(pt.name)}
                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${activeTab === pt.name ? "bg-brand-pink text-white shadow-sm" : "text-brand-text/60 hover:text-brand-heading"}`}
                    >
                        {pt.label}
                    </button>
                ))}
            </div>

            <div className="space-y-2 mb-5">
                {skus.length === 0 ? (
                    <div className="card text-center py-8 text-brand-text/50 text-sm">No SKUs found. Add some in SKU Manager.</div>
                ) : (
                    skus.map((sku) => {
                        const qty = stockMap[sku.id]?.[activeTab] ?? 0;
                        const status = getStockStatus(qty, sku.low_stock_threshold);
                        const pct = getStockPercentage(qty, sku.low_stock_threshold);
                        return <SkuStockRow key={sku.id} sku={sku} qty={qty} status={status} pct={pct} />;
                    })
                )}
            </div>

            {lowStockSkus.length > 0 && (
                <div className="card border-brand-pink/20 bg-pink-50/50">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">⚠️</span>
                        <h3 className="font-serif text-base text-brand-pink">Low Stock Alert</h3>
                    </div>
                    <div className="space-y-2">
                        {lowStockSkus.map((sku) => {
                            const qty = stockMap[sku.id]?.["30g_individual"] ?? 0;
                            const status = getStockStatus(qty, sku.low_stock_threshold);
                            return (
                                <div key={sku.id} className="flex items-center justify-between py-2 border-b border-brand-border last:border-0">
                                    <div>
                                        <p className="text-sm font-semibold text-brand-heading">{sku.name}</p>
                                        <p className="text-xs text-brand-text/50">{sku.code} · threshold: {sku.low_stock_threshold}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-brand-heading">{qty}</p>
                                        <span className={`pill-${status} pill`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-xs text-brand-text/50 mt-3">Consider submitting an inward entry</p>
                </div>
            )}
        </div>
    );
}

function MetricCard({ label, value, icon, alert }: { label: string; value: string | number; icon: string; alert?: boolean }) {
    return (
        <div className={`card space-y-1 ${alert ? "border-brand-pink/30 bg-pink-50/30" : ""}`}>
            <div className="flex items-center justify-between">
                <span className="text-xl">{icon}</span>
                {alert && <span className="pill-critical pill">!</span>}
            </div>
            <p className={`text-2xl font-bold ${alert ? "text-brand-pink" : "text-brand-heading"}`}>{value}</p>
            <p className="text-xs text-brand-text/60 font-medium">{label}</p>
        </div>
    );
}

const STATUS_LABELS = { good: "Good", low: "Low", critical: "Critical" };

function SkuStockRow({ sku, qty, status, pct }: { sku: SKU; qty: number; status: "good" | "low" | "critical"; pct: number }) {
    const barColor = status === "good" ? "bg-green-400" : status === "low" ? "bg-amber-400" : "bg-brand-pink";
    return (
        <div className="card flex items-center gap-4">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-brand-heading text-sm truncate">{sku.name}</p>
                    <span className={`pill pill-${status} shrink-0`}>{STATUS_LABELS[status]}</span>
                </div>
                <p className="text-xs text-brand-text/50 mb-2">{sku.code}</p>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`${barColor} h-1.5 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
            </div>
            <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-brand-heading leading-none">{qty}</p>
                <p className="text-[10px] text-brand-text/40 mt-0.5">units</p>
            </div>
        </div>
    );
}
