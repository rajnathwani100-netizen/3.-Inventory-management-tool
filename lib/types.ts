export type UserRole = "admin" | "staff";

export interface Profile {
    id: string;
    role: UserRole;
    name: string | null;
    created_at: string;
}

export interface SKU {
    id: string;
    code: string;
    name: string;
    category: string;
    low_stock_threshold: number;
    is_active: boolean;
    created_at: string;
}

export type PackType = "30g_individual" | "pack_of_6" | "sample_200g";
export type EntryStatus = "pending" | "approved" | "rejected";
export type StallStatus = "active" | "closed";
export type WipStatus = "in_progress" | "completed";

export interface StockLevel {
    id: string;
    sku_id: string;
    pack_type: PackType;
    quantity: number;
    updated_at: string;
}

export interface EntryBatch {
    id: string;
    direction: "inward" | "outward";
    pack_type: PackType;
    reason: string;
    notes: string | null;
    date: string;
    status: EntryStatus;
    submitted_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
    batch_items?: BatchItem[];
    submitter?: Profile;
    approver?: Profile;
}

export interface BatchItem {
    id: string;
    batch_id: string;
    sku_id: string;
    quantity: number;
    sku?: SKU;
}

export interface StallSession {
    id: string;
    name: string;
    location: string | null;
    date: string;
    status: StallStatus;
    created_by: string | null;
    closed_at: string | null;
    created_at: string;
    stall_items?: StallItem[];
}

export interface StallItem {
    id: string;
    stall_id: string;
    sku_id: string;
    pack_type: PackType;
    dispatched: number;
    returned: number | null;
    sold: number;
    sku?: SKU;
}

export interface WipConversion {
    id: string;
    sku_id: string;
    packs_30g_in: number;
    packs_of_6_out: number;
    status: WipStatus;
    created_by: string | null;
    completed_at: string | null;
    created_at: string;
    sku?: SKU;
}

export const PACK_TYPE_LABELS: Record<PackType, string> = {
    "30g_individual": "30g Individual",
    pack_of_6: "Pack of 6",
    sample_200g: "200g Sample",
};

export const INWARD_REASONS = [
    "Purchase",
    "Stall return",
    "Production batch",
    "Other",
];

export const OUTWARD_REASONS = [
    "Online sales",
    "Stall dispatch",
    "Sample distribution",
    "Damage / write-off",
    "Other",
];
