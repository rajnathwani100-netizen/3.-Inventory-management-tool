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

export interface PackTypeRecord {
    id: string;
    name: string;
    label: string;
    is_active: boolean;
    sort_order: number;
}

// PackType is now a plain string — the set of valid values lives in the DB
export type PackType = string;

export type EntryStatus = "pending" | "approved" | "rejected";
export type StallStatus = "active" | "closed";
export type WipStatus = "in_progress" | "completed" | "rejected";

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

export interface WipConversionItem {
    id: string;
    conversion_id: string;
    sku_id: string;
    pack_type: string;
    quantity: number;
    sku?: SKU;
}

export interface WipConversion {
    id: string;
    notes: string | null;
    date: string;
    status: WipStatus;
    created_by: string | null;
    approved_by: string | null;
    completed_at: string | null;
    created_at: string;
    recipe_id: string | null;
    selected_sku_id: string | null;    // the user-chosen flavour (for single-flavour packs)
    quantity: number;                   // number of output units being produced
    inputs?: WipConversionItem[];
    outputs?: WipConversionItem[];
    creator?: Profile;
    approver?: Profile;
    recipe?: ConversionRecipe;
}

export interface ConversionRecipeIngredient {
    id: string;
    recipe_id: string;
    input_sku_id: string | null;       // null = "same as selected SKU"
    input_pack_type: string;
    qty_per_output_unit: number;
    sku?: SKU;
}

export interface ConversionRecipe {
    id: string;
    name: string;
    output_sku_id: string | null;      // null = use selected_sku_id at run time
    output_pack_type: string;
    is_active: boolean;
    sort_order: number;
    ingredients?: ConversionRecipeIngredient[];
}

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
