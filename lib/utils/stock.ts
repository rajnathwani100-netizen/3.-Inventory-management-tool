import { SKU, StockLevel, PackType } from "@/lib/types";

export interface StockWithSku extends StockLevel {
    sku: SKU;
}

export function getStockStatus(quantity: number, threshold: number): "good" | "low" | "critical" {
    if (quantity >= threshold) return "good";
    if (quantity >= threshold * 0.4) return "low";
    return "critical";
}

export function getStockPercentage(quantity: number, threshold: number): number {
    return Math.min(100, Math.round((quantity / (threshold * 1.5)) * 100));
}

export function groupStockBySku(
    stockLevels: any[]
): Record<string, Record<PackType, number>> {
    const result: Record<string, Record<PackType, number>> = {};
    for (const sl of stockLevels) {
        if (!result[sl.sku_id]) {
            result[sl.sku_id] = {
                "30g_individual": 0,
                pack_of_6: 0,
                sample_200g: 0,
            };
        }
        result[sl.sku_id][sl.pack_type as PackType] = sl.quantity;
    }
    return result;
}

export function countLowStockSkus(
    skus: SKU[],
    stockMap: Record<string, Record<PackType, number>>
): number {
    return skus.filter((sku) => {
        const stock = stockMap[sku.id];
        if (!stock) return true;
        return stock["30g_individual"] < sku.low_stock_threshold;
    }).length;
}
