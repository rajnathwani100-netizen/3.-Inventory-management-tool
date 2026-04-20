# Knacks Inventory Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SKU nav link, loading skeletons, dynamic pack types, flexible WIP conversion, and SKU Manager stock inline view.

**Architecture:** Dynamic pack types are fetched server-side and passed as props to all client components, keeping the existing server→client data-flow pattern. The `PackType` TypeScript type widens from a union to `string`. A single SQL migration (`002_pack_types.sql`) handles all DB changes: new `pack_types` table, removing the check constraint on `stock_levels`, and restructuring `wip_conversions`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL + RLS), Tailwind CSS, react-hot-toast

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/002_pack_types.sql` | Create | All DB schema changes |
| `lib/types.ts` | Modify | Widen PackType, add PackTypeRecord, remove PACK_TYPE_LABELS |
| `lib/actions/packTypes.ts` | Create | getPackTypes, createPackType, togglePackType server actions |
| `lib/actions/conversions.ts` | Modify | Flexible from/to pack type conversion logic |
| `components/layout/BottomNav.tsx` | Modify | Add /skus link for admin, add prefetch |
| `app/(app)/inventory/loading.tsx` | Create | Inventory page skeleton |
| `app/(app)/inward/loading.tsx` | Create | Inward page skeleton |
| `app/(app)/outward/loading.tsx` | Create | Outward page skeleton |
| `app/(app)/stalls/loading.tsx` | Create | Stalls page skeleton |
| `app/(app)/approvals/loading.tsx` | Create | Approvals page skeleton |
| `app/(app)/skus/loading.tsx` | Create | SKU Manager skeleton |
| `app/(app)/analytics/loading.tsx` | Create | Analytics page skeleton |
| `app/(app)/inventory/page.tsx` | Modify | Fetch and pass packTypes prop |
| `app/(app)/inventory/InventoryClient.tsx` | Modify | Use dynamic pack types from props |
| `app/(app)/inward/page.tsx` | Modify | Fetch and pass packTypes prop |
| `app/(app)/inward/InwardClient.tsx` | Modify | Use dynamic pack types from props |
| `app/(app)/outward/page.tsx` | Modify | Fetch and pass packTypes prop |
| `app/(app)/outward/OutwardClient.tsx` | Modify | Use dynamic pack types from props |
| `app/(app)/stalls/page.tsx` | Modify | Fetch and pass packTypes prop |
| `app/(app)/stalls/StallsClient.tsx` | Modify | Dynamic pack types, new flexible conversion form |
| `app/(app)/skus/page.tsx` | Modify | Fetch packTypes + stockLevels, pass to client |
| `app/(app)/skus/SkusClient.tsx` | Modify | Show stock inline per SKU, pack types management section |

---

## Task 1: SQL Migration — pack_types table + DB restructure

**Files:**
- Create: `supabase/migrations/002_pack_types.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- Migration 002: Dynamic Pack Types + Flexible WIP Conversions
-- Run this in Supabase SQL Editor after 001_schema.sql
-- ============================================================

-- PACK TYPES table
create table if not exists pack_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  label text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Seed initial pack types
insert into pack_types (name, label, is_active, sort_order) values
  ('30g_individual', '30g Individual', true, 1),
  ('pack_of_6',      'Pack of 6',      true, 2),
  ('sample_200g',    '200g Sample',     true, 3)
on conflict (name) do nothing;

-- RLS for pack_types
alter table pack_types enable row level security;

create policy "All authenticated can read pack_types"
  on pack_types for select using (auth.uid() is not null);

create policy "Only admins can insert pack_types"
  on pack_types for insert with check (is_admin());

create policy "Only admins can update pack_types"
  on pack_types for update using (is_admin());

-- Remove hardcoded check constraint on stock_levels.pack_type
alter table stock_levels drop constraint if exists stock_levels_pack_type_check;

-- Restructure wip_conversions for flexible conversion
-- Drop the generated column first (depends on packs_30g_in), then the source column
alter table wip_conversions drop column if exists packs_of_6_out;
alter table wip_conversions drop column if exists packs_30g_in;

alter table wip_conversions
  add column if not exists from_pack_type text not null default '30g_individual',
  add column if not exists to_pack_type text not null default 'pack_of_6',
  add column if not exists input_qty int not null default 0,
  add column if not exists output_qty int not null default 0;
```

- [ ] **Step 2: Verify the SQL is correct before applying**

Read through the file and confirm:
- `pack_types` table has all 5 columns (id, name, label, is_active, sort_order)
- 3 seed rows match: `30g_individual`, `pack_of_6`, `sample_200g`
- `stock_levels_pack_type_check` constraint is dropped (use `if exists` in case name differs)
- `wip_conversions` drops both generated+source columns before adding new ones
- RLS policies are present for `pack_types`

- [ ] **Step 3: Apply migration in Supabase**

Open Supabase SQL Editor, paste the contents of `002_pack_types.sql`, run it. Confirm no errors. Check Table Editor shows `pack_types` table with 3 rows.

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Read current lib/types.ts**

Current file has:
```ts
export type PackType = "30g_individual" | "pack_of_6" | "sample_200g";
export const PACK_TYPE_LABELS: Record<PackType, string> = { ... };
export interface WipConversion { packs_30g_in: number; packs_of_6_out: number; ... }
```

- [ ] **Step 2: Replace types.ts with updated version**

Replace the entire file:

```ts
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
    from_pack_type: string;
    to_pack_type: string;
    input_qty: number;
    output_qty: number;
    status: WipStatus;
    created_by: string | null;
    completed_at: string | null;
    created_at: string;
    sku?: SKU;
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
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_pack_types.sql lib/types.ts
git commit -m "feat: dynamic pack_types table + wip_conversions restructure"
```

---

## Task 3: Create packTypes server actions

**Files:**
- Create: `lib/actions/packTypes.ts`

- [ ] **Step 1: Create the file**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { PackTypeRecord } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function getPackTypes(): Promise<PackTypeRecord[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("pack_types")
        .select("*")
        .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function createPackType(params: {
    name: string;
    label: string;
}): Promise<void> {
    const supabase = await createClient();
    const { data: existing } = await supabase
        .from("pack_types")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();
    const nextOrder = (existing?.sort_order ?? 0) + 1;
    const { error } = await supabase.from("pack_types").insert({
        name: params.name,
        label: params.label,
        is_active: true,
        sort_order: nextOrder,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/skus");
}

export async function togglePackType(id: string, isActive: boolean): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
        .from("pack_types")
        .update({ is_active: !isActive })
        .eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/skus");
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/packTypes.ts
git commit -m "feat: add packTypes server actions"
```

---

## Task 4: Update conversions server action

**Files:**
- Modify: `lib/actions/conversions.ts`

- [ ] **Step 1: Replace conversions.ts**

```ts
"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createConversion(params: {
    skuId: string;
    fromPackType: string;
    toPackType: string;
    inputQty: number;
    outputQty: number;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    if (params.inputQty <= 0) throw new Error("Input quantity must be > 0");
    if (params.outputQty <= 0) throw new Error("Output quantity must be > 0");
    if (params.fromPackType === params.toPackType) throw new Error("From and To pack types must differ");

    const { error } = await supabase.from("wip_conversions").insert({
        sku_id: params.skuId,
        from_pack_type: params.fromPackType,
        to_pack_type: params.toPackType,
        input_qty: params.inputQty,
        output_qty: params.outputQty,
        status: "in_progress",
        created_by: user.id,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/stalls");
    return { success: true };
}

export async function completeConversion(conversionId: string) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: conv } = await supabase
        .from("wip_conversions")
        .select("*")
        .eq("id", conversionId)
        .single();

    if (!conv) throw new Error("Conversion not found");
    if (conv.status !== "in_progress") throw new Error("Already completed");

    // Deduct input stock
    const { data: stockFrom } = await serviceSupabase
        .from("stock_levels")
        .select("quantity, id")
        .eq("sku_id", conv.sku_id)
        .eq("pack_type", conv.from_pack_type)
        .single();

    if (!stockFrom) throw new Error(`No stock record for pack type: ${conv.from_pack_type}`);
    const newFromQty = stockFrom.quantity - conv.input_qty;
    if (newFromQty < 0) throw new Error(`Insufficient ${conv.from_pack_type} stock for conversion`);

    await serviceSupabase
        .from("stock_levels")
        .update({ quantity: newFromQty, updated_at: new Date().toISOString() })
        .eq("id", stockFrom.id);

    // Add output stock (upsert in case the row doesn't exist yet)
    const { data: stockTo } = await serviceSupabase
        .from("stock_levels")
        .select("quantity, id")
        .eq("sku_id", conv.sku_id)
        .eq("pack_type", conv.to_pack_type)
        .single();

    if (stockTo) {
        await serviceSupabase
            .from("stock_levels")
            .update({ quantity: stockTo.quantity + conv.output_qty, updated_at: new Date().toISOString() })
            .eq("id", stockTo.id);
    } else {
        await serviceSupabase
            .from("stock_levels")
            .insert({ sku_id: conv.sku_id, pack_type: conv.to_pack_type, quantity: conv.output_qty });
    }

    await serviceSupabase
        .from("wip_conversions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", conversionId);

    revalidatePath("/stalls");
    revalidatePath("/inventory");
    return { success: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/conversions.ts
git commit -m "feat: flexible wip conversion with from/to pack types"
```

---

## Task 5: Update BottomNav — add /skus link + prefetch

**Files:**
- Modify: `components/layout/BottomNav.tsx`

- [ ] **Step 1: Replace BottomNav.tsx**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
    role: string;
    pendingCount?: number;
}

const navItems = [
    {
        href: "/inventory",
        label: "Inventory",
        icon: (active: boolean) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#EB2676" : "#3B1D0680"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="7" height="7" rx="1" />
                <rect x="15" y="3" width="7" height="7" rx="1" />
                <rect x="2" y="14" width="7" height="7" rx="1" />
                <rect x="15" y="14" width="7" height="7" rx="1" />
            </svg>
        ),
    },
    {
        href: "/analytics",
        label: "Analytics",
        icon: (active: boolean) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#EB2676" : "#3B1D0680"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
        ),
    },
    {
        href: "/inward",
        label: "Inward",
        icon: (active: boolean) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#EB2676" : "#3B1D0680"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
            </svg>
        ),
    },
    {
        href: "/outward",
        label: "Outward",
        icon: (active: boolean) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#EB2676" : "#3B1D0680"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
            </svg>
        ),
    },
    {
        href: "/stalls",
        label: "Stalls",
        icon: (active: boolean) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#EB2676" : "#3B1D0680"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
        ),
    },
];

const adminOnlyItems = [
    {
        href: "/skus",
        label: "SKUs",
        icon: (active: boolean) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#EB2676" : "#3B1D0680"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
        ),
    },
    {
        href: "/approvals",
        label: "Approvals",
        icon: (active: boolean) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#EB2676" : "#3B1D0680"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
            </svg>
        ),
    },
];

export default function BottomNav({ role, pendingCount = 0 }: BottomNavProps) {
    const pathname = usePathname();

    const allItems =
        role === "admin"
            ? [
                ...navItems,
                adminOnlyItems[0], // SKUs
                {
                    ...adminOnlyItems[1], // Approvals
                    badge: pendingCount,
                },
            ]
            : navItems;

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-brand-border">
            <div className="flex items-stretch justify-around px-1 pt-1" style={{ paddingBottom: "calc(0.25rem + env(safe-area-inset-bottom))" }}>
                {allItems.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                        <Link key={item.href} href={item.href} prefetch={true} className="flex flex-col items-center gap-0.5 py-2 px-3 relative min-w-0 flex-1">
                            <div className="relative">
                                {item.icon(active)}
                                {"badge" in item && (item.badge ?? 0) > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-brand-pink text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                        {(item.badge ?? 0) > 9 ? "9+" : item.badge}
                                    </span>
                                )}
                            </div>
                            <span className={`text-[10px] font-medium leading-none ${active ? "text-brand-pink" : "text-brand-text/60"}`}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/BottomNav.tsx
git commit -m "feat: add /skus nav link for admin, add prefetch to all nav links"
```

---

## Task 6: Add loading.tsx skeletons to all route folders

**Files:**
- Create: `app/(app)/inventory/loading.tsx`
- Create: `app/(app)/inward/loading.tsx`
- Create: `app/(app)/outward/loading.tsx`
- Create: `app/(app)/stalls/loading.tsx`
- Create: `app/(app)/approvals/loading.tsx`
- Create: `app/(app)/skus/loading.tsx`
- Create: `app/(app)/analytics/loading.tsx`

- [ ] **Step 1: Create inventory/loading.tsx**

```tsx
export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto animate-pulse">
            <div className="h-6 w-36 bg-gray-200 rounded-lg mb-4" />
            <div className="grid grid-cols-2 gap-3 mb-5">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="card space-y-2">
                        <div className="h-5 w-5 bg-gray-200 rounded" />
                        <div className="h-7 w-16 bg-gray-200 rounded-lg" />
                        <div className="h-3 w-20 bg-gray-100 rounded" />
                    </div>
                ))}
            </div>
            <div className="flex gap-1 bg-white rounded-xl p-1 border border-brand-border mb-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex-1 h-9 bg-gray-100 rounded-lg" />
                ))}
            </div>
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="card flex items-center gap-4">
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-32 bg-gray-200 rounded" />
                            <div className="h-3 w-20 bg-gray-100 rounded" />
                            <div className="w-full bg-gray-100 rounded-full h-1.5" />
                        </div>
                        <div className="h-8 w-10 bg-gray-200 rounded-lg shrink-0" />
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Create inward/loading.tsx**

```tsx
export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-5 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-6 w-28 bg-gray-200 rounded-lg" />
                <div className="flex gap-2">
                    <div className="h-9 w-24 bg-gray-100 rounded-xl" />
                    <div className="h-9 w-28 bg-gray-200 rounded-xl" />
                </div>
            </div>
            <div>
                <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="card flex items-start gap-3">
                            <div className="flex-1 space-y-1.5">
                                <div className="h-4 w-48 bg-gray-200 rounded" />
                                <div className="h-3 w-32 bg-gray-100 rounded" />
                            </div>
                            <div className="h-6 w-16 bg-gray-100 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Create outward/loading.tsx**

```tsx
export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-5 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-6 w-28 bg-gray-200 rounded-lg" />
                <div className="flex gap-2">
                    <div className="h-9 w-24 bg-gray-100 rounded-xl" />
                    <div className="h-9 w-28 bg-gray-200 rounded-xl" />
                </div>
            </div>
            <div>
                <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="card flex items-start gap-3">
                            <div className="flex-1 space-y-1.5">
                                <div className="h-4 w-48 bg-gray-200 rounded" />
                                <div className="h-3 w-32 bg-gray-100 rounded" />
                            </div>
                            <div className="h-6 w-16 bg-gray-100 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Create stalls/loading.tsx**

```tsx
export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-6 w-36 bg-gray-200 rounded-lg" />
                <div className="h-9 w-28 bg-gray-200 rounded-xl" />
            </div>
            <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="card space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="h-6 w-14 bg-gray-100 rounded-full" />
                            <div className="h-4 w-32 bg-gray-200 rounded" />
                        </div>
                        <div className="h-3 w-full bg-gray-100 rounded-full" />
                        <div className="flex gap-2">
                            <div className="h-9 flex-1 bg-gray-100 rounded-xl" />
                            <div className="h-9 w-24 bg-gray-100 rounded-xl" />
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between">
                <div className="h-6 w-40 bg-gray-200 rounded-lg" />
                <div className="h-9 w-24 bg-gray-100 rounded-xl" />
            </div>
            <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="card flex items-center gap-3">
                        <div className="flex-1 space-y-1">
                            <div className="h-4 w-32 bg-gray-200 rounded" />
                            <div className="h-3 w-40 bg-gray-100 rounded" />
                        </div>
                        <div className="h-8 w-20 bg-gray-100 rounded-xl" />
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Create approvals/loading.tsx**

```tsx
export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4 animate-pulse">
            <div className="h-6 w-32 bg-gray-200 rounded-lg" />
            <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="card space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-1.5">
                                <div className="h-4 w-48 bg-gray-200 rounded" />
                                <div className="h-3 w-36 bg-gray-100 rounded" />
                                <div className="h-3 w-28 bg-gray-100 rounded" />
                            </div>
                            <div className="h-6 w-16 bg-gray-100 rounded-full" />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <div className="h-9 flex-1 bg-green-100 rounded-xl" />
                            <div className="h-9 flex-1 bg-red-100 rounded-xl" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 6: Create skus/loading.tsx**

```tsx
export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-6 w-32 bg-gray-200 rounded-lg" />
                <div className="h-9 w-24 bg-gray-200 rounded-xl" />
            </div>
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="card">
                        <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-2">
                                <div className="flex gap-2">
                                    <div className="h-4 w-28 bg-gray-200 rounded" />
                                    <div className="h-4 w-16 bg-gray-100 rounded-full" />
                                </div>
                                <div className="flex gap-2">
                                    {[...Array(3)].map((_, j) => (
                                        <div key={j} className="h-5 w-20 bg-gray-100 rounded-lg" />
                                    ))}
                                </div>
                            </div>
                            <div className="h-8 w-16 bg-gray-100 rounded-xl" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 7: Create analytics/loading.tsx**

```tsx
export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4 animate-pulse">
            <div className="h-6 w-24 bg-gray-200 rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="card space-y-2">
                        <div className="h-4 w-20 bg-gray-200 rounded" />
                        <div className="h-8 w-16 bg-gray-200 rounded-lg" />
                    </div>
                ))}
            </div>
            <div className="card space-y-3">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="h-3 w-24 bg-gray-100 rounded" />
                        <div className="flex-1 h-3 bg-gray-100 rounded-full" />
                        <div className="h-3 w-10 bg-gray-100 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 8: Commit**

```bash
git add app/\(app\)/inventory/loading.tsx app/\(app\)/inward/loading.tsx app/\(app\)/outward/loading.tsx app/\(app\)/stalls/loading.tsx app/\(app\)/approvals/loading.tsx app/\(app\)/skus/loading.tsx app/\(app\)/analytics/loading.tsx
git commit -m "feat: add loading skeleton to all route pages"
```

---

## Task 7: Update inventory page + client for dynamic pack types

**Files:**
- Modify: `app/(app)/inventory/page.tsx`
- Modify: `app/(app)/inventory/InventoryClient.tsx`

- [ ] **Step 1: Read current inventory/page.tsx**

Check what it currently fetches (skus, stock_levels) — we need to add packTypes fetch.

- [ ] **Step 2: Update inventory/page.tsx**

```tsx
export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import InventoryClient from "./InventoryClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function InventoryPage() {
    const supabase = await createClient();
    const [
        { data: skus },
        { data: stockLevels },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").eq("is_active", true).order("code"),
        supabase.from("stock_levels").select("*, sku:skus(*)"),
        getPackTypes(),
    ]);

    return (
        <InventoryClient
            initialSkus={skus ?? []}
            initialStockLevels={stockLevels ?? []}
            packTypes={packTypes}
        />
    );
}
```

- [ ] **Step 3: Update InventoryClient.tsx**

Replace the entire file:

```tsx
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

    const activePackType = packTypes.find((pt) => pt.name === activeTab);

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
```

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/inventory/page.tsx app/\(app\)/inventory/InventoryClient.tsx
git commit -m "feat: inventory uses dynamic pack types from DB"
```

---

## Task 8: Update inward page + client for dynamic pack types

**Files:**
- Modify: `app/(app)/inward/page.tsx`
- Modify: `app/(app)/inward/InwardClient.tsx`

- [ ] **Step 1: Read current inward/page.tsx to understand its current fetch pattern**

- [ ] **Step 2: Update inward/page.tsx**

```tsx
export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import InwardClient from "./InwardClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function InwardPage() {
    const supabase = await createClient();
    const [
        { data: skus },
        { data: batches },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").eq("is_active", true).order("code"),
        supabase.from("entry_batches")
            .select("*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name)")
            .eq("direction", "inward")
            .order("created_at", { ascending: false })
            .limit(20),
        getPackTypes(),
    ]);

    return <InwardClient skus={skus ?? []} initialBatches={batches ?? []} packTypes={packTypes} />;
}
```

- [ ] **Step 3: Update InwardClient.tsx**

Replace the entire file:

```tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { SKU, PackTypeRecord, INWARD_REASONS } from "@/lib/types";
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

export default function InwardClient({ skus: initialSkus, initialBatches, packTypes }: Props) {
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const actualReason = reason === "__custom__" ? "" : reason;
        if (!actualReason) { toast.error("Please select or enter a reason"); return; }
        if (items.length === 0) { toast.error("Select at least one SKU"); return; }

        startTransition(async () => {
            try {
                await submitBatchEntry({ direction: "inward", packType, reason: actualReason, notes, date, items });
                toast.success("Inward entry submitted for approval");
                setItems([]); setReason(""); setNotes(""); setShowForm(false);
                const supabase = createClient();
                const { data } = await supabase.from("entry_batches")
                    .select("*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name)")
                    .eq("direction", "inward")
                    .order("created_at", { ascending: false })
                    .limit(20);
                if (data) setBatches(data);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const packTypeLabel = (name: string) =>
        packTypes.find((pt) => pt.name === name)?.label ?? name;

    const handleExport = () => {
        const rows = batches.filter((b) => b.status === "approved").flatMap((b: any) =>
            (b.batch_items || []).map((item: any) => ({
                Date: b.date, "SKU Code": item.sku?.code ?? "", "SKU Name": item.sku?.name ?? "",
                "Pack Type": packTypeLabel(b.pack_type),
                Quantity: item.quantity, Reason: b.reason, Notes: b.notes ?? "",
                Status: b.status, "Submitted By": b.submitter?.name ?? "", "Approved Date": b.approved_at ?? "",
            }))
        );
        generateCSV(rows, `knacks_inward_${formatDateForFilename()}.csv`);
    };

    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="section-title">Inward Log</h2>
                <div className="flex gap-2">
                    <button onClick={handleExport} className="btn-ghost text-sm py-2 px-3">Export CSV</button>
                    <button onClick={() => setShowForm(!showForm)} className="btn-pink text-sm py-2 px-4">
                        {showForm ? "Cancel" : "+ New Entry"}
                    </button>
                </div>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} className="card space-y-5">
                    <h3 className="font-serif text-lg text-brand-heading">New Inward Entry</h3>
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
                    <ReasonPicker reasons={INWARD_REASONS} value={reason} onChange={setReason} />
                    <BatchSkuPicker skus={skus} value={items} onChange={setItems} />
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Date</label>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                        </div>
                        <div>
                            <label className="label">Notes</label>
                            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Batch #, supplier..." className="input" />
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
                    <div className="card text-center py-8 text-brand-text/50 text-sm">No inward entries yet</div>
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
```

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/inward/page.tsx app/\(app\)/inward/InwardClient.tsx
git commit -m "feat: inward uses dynamic pack types from DB"
```

---

## Task 9: Update outward page + client for dynamic pack types

**Files:**
- Modify: `app/(app)/outward/page.tsx`
- Modify: `app/(app)/outward/OutwardClient.tsx`

- [ ] **Step 1: Read current outward/page.tsx**

- [ ] **Step 2: Update outward/page.tsx**

```tsx
export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import OutwardClient from "./OutwardClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function OutwardPage() {
    const supabase = await createClient();
    const [
        { data: skus },
        { data: batches },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").eq("is_active", true).order("code"),
        supabase.from("entry_batches")
            .select("*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name)")
            .eq("direction", "outward")
            .order("created_at", { ascending: false })
            .limit(20),
        getPackTypes(),
    ]);

    return <OutwardClient skus={skus ?? []} initialBatches={batches ?? []} packTypes={packTypes} />;
}
```

- [ ] **Step 3: Update OutwardClient.tsx**

Replace the entire file:

```tsx
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
```

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/outward/page.tsx app/\(app\)/outward/OutwardClient.tsx
git commit -m "feat: outward uses dynamic pack types from DB"
```

---

## Task 10: Update stalls page + client — dynamic pack types + flexible conversion

**Files:**
- Modify: `app/(app)/stalls/page.tsx`
- Modify: `app/(app)/stalls/StallsClient.tsx`

- [ ] **Step 1: Read current stalls/page.tsx**

- [ ] **Step 2: Update stalls/page.tsx**

```tsx
export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import StallsClient from "./StallsClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function StallsPage() {
    const supabase = await createClient();
    const [
        { data: skus },
        { data: stalls },
        { data: conversions },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").eq("is_active", true).order("code"),
        supabase.from("stall_sessions")
            .select("*, stall_items(*, sku:skus(*))")
            .order("created_at", { ascending: false })
            .limit(20),
        supabase.from("wip_conversions")
            .select("*, sku:skus(*)")
            .order("created_at", { ascending: false })
            .limit(20),
        getPackTypes(),
    ]);

    return (
        <StallsClient
            skus={skus ?? []}
            initialStalls={stalls ?? []}
            initialConversions={conversions ?? []}
            packTypes={packTypes}
        />
    );
}
```

- [ ] **Step 3: Update StallsClient.tsx**

Replace the entire file:

```tsx
"use client";

import { useState, useTransition } from "react";
import { SKU, PackTypeRecord } from "@/lib/types";
import { openStall, logReturn } from "@/lib/actions/stalls";
import { createConversion, completeConversion } from "@/lib/actions/conversions";
import toast from "react-hot-toast";

interface Props {
    skus: SKU[];
    initialStalls: any[];
    initialConversions: any[];
    packTypes: PackTypeRecord[];
}

export default function StallsClient({ skus, initialStalls, initialConversions, packTypes }: Props) {
    const [stalls, setStalls] = useState(initialStalls);
    const [conversions, setConversions] = useState(initialConversions);
    const [isPending, startTransition] = useTransition();
    const [showStallForm, setShowStallForm] = useState(false);
    const [showWipForm, setShowWipForm] = useState(false);
    const [returnInputs, setReturnInputs] = useState<Record<string, string>>({});

    const [stallName, setStallName] = useState("");
    const [stallLocation, setStallLocation] = useState("");
    const [stallDate, setStallDate] = useState(new Date().toISOString().split("T")[0]);
    const [stallSkuId, setStallSkuId] = useState(skus[0]?.id ?? "");
    const [stallPackType, setStallPackType] = useState<string>(packTypes[0]?.name ?? "30g_individual");
    const [stallDispatched, setStallDispatched] = useState(1);

    const [wipSkuId, setWipSkuId] = useState(skus[0]?.id ?? "");
    const [wipFromPackType, setWipFromPackType] = useState<string>(packTypes[0]?.name ?? "30g_individual");
    const [wipToPackType, setWipToPackType] = useState<string>(packTypes[1]?.name ?? "pack_of_6");
    const [wipInputQty, setWipInputQty] = useState(1);
    const [wipOutputQty, setWipOutputQty] = useState(1);

    const packTypeLabel = (name: string) =>
        packTypes.find((pt) => pt.name === name)?.label ?? name;

    const handleOpenStall = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stallName) { toast.error("Enter a stall name"); return; }
        startTransition(async () => {
            try {
                await openStall({ name: stallName, location: stallLocation, date: stallDate, skuId: stallSkuId, packType: stallPackType, dispatched: stallDispatched });
                toast.success("Stall opened & stock dispatched");
                setShowStallForm(false); setStallName(""); setStallLocation(""); setStallDispatched(1);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleLogReturn = async (stallId: string, stallItemId: string) => {
        const returned = parseInt(returnInputs[stallItemId] ?? "0");
        if (isNaN(returned) || returned < 0) { toast.error("Invalid return quantity"); return; }
        startTransition(async () => {
            try {
                await logReturn({ stallId, stallItemId, returned });
                toast.success("Return logged, stall closed");
                setReturnInputs((prev) => { const n = { ...prev }; delete n[stallItemId]; return n; });
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleCreateConversion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (wipFromPackType === wipToPackType) { toast.error("From and To pack types must differ"); return; }
        if (wipInputQty <= 0 || wipOutputQty <= 0) { toast.error("Quantities must be greater than 0"); return; }
        startTransition(async () => {
            try {
                await createConversion({
                    skuId: wipSkuId,
                    fromPackType: wipFromPackType,
                    toPackType: wipToPackType,
                    inputQty: wipInputQty,
                    outputQty: wipOutputQty,
                });
                toast.success("Conversion created");
                setShowWipForm(false);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleCompleteConversion = async (id: string) => {
        startTransition(async () => {
            try {
                await completeConversion(id);
                toast.success("Conversion completed, stock updated");
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const activeStalls = stalls.filter((s) => s.status === "active");
    const closedStalls = stalls.filter((s) => s.status === "closed");

    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-6">
            {/* Stall Manager */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="section-title">Stall Manager</h2>
                    <button onClick={() => setShowStallForm(!showStallForm)} className="btn-pink text-sm py-2 px-4">
                        {showStallForm ? "Cancel" : "+ Open Stall"}
                    </button>
                </div>

                {showStallForm && (
                    <form onSubmit={handleOpenStall} className="card space-y-4 mb-4">
                        <h3 className="font-serif text-base">New Stall Session</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Stall Name *</label>
                                <input value={stallName} onChange={(e) => setStallName(e.target.value)} placeholder="e.g. Bandra Market" className="input" required />
                            </div>
                            <div>
                                <label className="label">Location</label>
                                <input value={stallLocation} onChange={(e) => setStallLocation(e.target.value)} placeholder="Optional" className="input" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Date</label>
                                <input type="date" value={stallDate} onChange={(e) => setStallDate(e.target.value)} className="input" />
                            </div>
                            <div>
                                <label className="label">Dispatched Qty</label>
                                <input type="number" min={1} value={stallDispatched} onChange={(e) => setStallDispatched(parseInt(e.target.value) || 1)} className="input" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">SKU</label>
                                <select value={stallSkuId} onChange={(e) => setStallSkuId(e.target.value)} className="input">
                                    {skus.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">Pack Type</label>
                                <select value={stallPackType} onChange={(e) => setStallPackType(e.target.value)} className="input">
                                    {packTypes.map((pt) => (
                                        <option key={pt.name} value={pt.name}>{pt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button type="submit" disabled={isPending} className="btn-primary w-full">Open Stall & Dispatch</button>
                    </form>
                )}

                {activeStalls.length === 0 && !showStallForm && (
                    <div className="card text-center py-8 text-brand-text/50 text-sm">No active stalls</div>
                )}

                <div className="space-y-3">
                    {activeStalls.map((stall: any) => (
                        <div key={stall.id} className="card border-green-200">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="pill bg-green-100 text-green-700">Active</span>
                                <h3 className="font-semibold text-brand-heading">{stall.name}</h3>
                                {stall.location && <span className="text-xs text-brand-text/50">· {stall.location}</span>}
                                <span className="ml-auto text-xs text-brand-text/40">{stall.date}</span>
                            </div>
                            {(stall.stall_items || []).map((item: any) => {
                                const dispatched = item.dispatched;
                                const returned = item.returned ?? 0;
                                const sold = dispatched - returned;
                                const pct = dispatched > 0 ? Math.round((sold / dispatched) * 100) : 0;
                                return (
                                    <div key={item.id} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-brand-text/70">{item.sku?.name ?? "?"} · {packTypeLabel(item.pack_type)}</span>
                                            <span className="font-semibold">{sold} sold / {dispatched} dispatched</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className="bg-brand-pink h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                        <p className="text-xs text-brand-text/50">{pct}% sell-through</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <input type="number" min={0} max={dispatched}
                                                value={returnInputs[item.id] ?? ""}
                                                onChange={(e) => setReturnInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                                placeholder="Return qty" className="input py-2 text-sm" />
                                            <button onClick={() => handleLogReturn(stall.id, item.id)} disabled={isPending} className="btn-ghost text-sm py-2 px-4 whitespace-nowrap">
                                                Log Return
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {closedStalls.length > 0 && (
                    <details className="mt-4">
                        <summary className="text-sm text-brand-text/50 cursor-pointer mb-2">Closed stalls ({closedStalls.length})</summary>
                        <div className="space-y-2">
                            {closedStalls.map((stall: any) => (
                                <div key={stall.id} className="card opacity-70">
                                    <div className="flex items-center gap-2">
                                        <span className="pill bg-gray-100 text-gray-500">Closed</span>
                                        <span className="font-medium text-sm">{stall.name}</span>
                                        <span className="ml-auto text-xs text-brand-text/40">{stall.date}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </div>

            {/* WIP Conversions */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="section-title">WIP Conversions</h2>
                    <button onClick={() => setShowWipForm(!showWipForm)} className="btn-ghost text-sm py-2 px-4">
                        {showWipForm ? "Cancel" : "+ Convert"}
                    </button>
                </div>

                {showWipForm && (
                    <form onSubmit={handleCreateConversion} className="card space-y-4 mb-4">
                        <h3 className="font-serif text-base">New Pack Conversion</h3>
                        <div>
                            <label className="label">SKU</label>
                            <select value={wipSkuId} onChange={(e) => setWipSkuId(e.target.value)} className="input">
                                {skus.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">From Pack Type</label>
                                <select value={wipFromPackType} onChange={(e) => setWipFromPackType(e.target.value)} className="input">
                                    {packTypes.map((pt) => (
                                        <option key={pt.name} value={pt.name}>{pt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">To Pack Type</label>
                                <select value={wipToPackType} onChange={(e) => setWipToPackType(e.target.value)} className="input">
                                    {packTypes.map((pt) => (
                                        <option key={pt.name} value={pt.name}>{pt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Input Qty (consumed)</label>
                                <input type="number" min={1} value={wipInputQty} onChange={(e) => setWipInputQty(parseInt(e.target.value) || 1)} className="input" />
                            </div>
                            <div>
                                <label className="label">Output Qty (produced)</label>
                                <input type="number" min={1} value={wipOutputQty} onChange={(e) => setWipOutputQty(parseInt(e.target.value) || 1)} className="input" />
                            </div>
                        </div>
                        <div className="bg-brand-bg rounded-xl p-3 text-sm">
                            <p className="text-brand-heading font-semibold">
                                {wipInputQty} × {packTypeLabel(wipFromPackType)} → {wipOutputQty} × {packTypeLabel(wipToPackType)}
                            </p>
                        </div>
                        <button type="submit" disabled={isPending} className="btn-primary w-full">Create Conversion</button>
                    </form>
                )}

                {conversions.length === 0 ? (
                    <div className="card text-center py-6 text-brand-text/50 text-sm">No conversions yet</div>
                ) : (
                    <div className="space-y-2">
                        {conversions.map((conv: any) => (
                            <div key={conv.id} className="card flex items-center gap-3">
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-brand-heading">{conv.sku?.name ?? "?"}</p>
                                    <p className="text-xs text-brand-text/50">
                                        {conv.input_qty} × {packTypeLabel(conv.from_pack_type)} → {conv.output_qty} × {packTypeLabel(conv.to_pack_type)}
                                    </p>
                                </div>
                                {conv.status === "in_progress" ? (
                                    <button onClick={() => handleCompleteConversion(conv.id)} disabled={isPending} className="btn-pink text-xs py-1.5 px-3">Mark Done</button>
                                ) : (
                                    <span className="pill-approved pill">Done</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/stalls/page.tsx app/\(app\)/stalls/StallsClient.tsx
git commit -m "feat: stalls uses dynamic pack types, flexible WIP conversion form"
```

---

## Task 11: Update SKU Manager — stock inline + pack types management

**Files:**
- Modify: `app/(app)/skus/page.tsx`
- Modify: `app/(app)/skus/SkusClient.tsx`

- [ ] **Step 1: Read current skus/page.tsx**

- [ ] **Step 2: Update skus/page.tsx**

```tsx
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SkusClient from "./SkusClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function SkusPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const isAdmin = profile?.role === "admin";

    const [
        { data: skus },
        { data: stockLevels },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").order("code"),
        isAdmin ? supabase.from("stock_levels").select("*") : Promise.resolve({ data: [] }),
        isAdmin ? getPackTypes() : Promise.resolve([]),
    ]);

    return (
        <SkusClient
            initialSkus={skus ?? []}
            initialStockLevels={stockLevels ?? []}
            initialPackTypes={packTypes}
            isAdmin={isAdmin}
        />
    );
}
```

- [ ] **Step 3: Update SkusClient.tsx**

Replace the entire file:

```tsx
"use client";

import { useState, useTransition } from "react";
import { SKU, PackTypeRecord } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { createPackType, togglePackType } from "@/lib/actions/packTypes";
import toast from "react-hot-toast";

interface Props {
    initialSkus: SKU[];
    initialStockLevels: any[];
    initialPackTypes: PackTypeRecord[];
    isAdmin: boolean;
}

export default function SkusClient({ initialSkus, initialStockLevels, initialPackTypes, isAdmin }: Props) {
    const [skus, setSkus] = useState<SKU[]>(initialSkus);
    const [stockLevels, setStockLevels] = useState<any[]>(initialStockLevels);
    const [packTypes, setPackTypes] = useState<PackTypeRecord[]>(initialPackTypes);
    const [showSkuForm, setShowSkuForm] = useState(false);
    const [showPackTypeForm, setShowPackTypeForm] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [editingThreshold, setEditingThreshold] = useState<Record<string, number>>({});
    const [newSku, setNewSku] = useState({ code: "", name: "", category: "Snacks", threshold: 100 });
    const [newPackType, setNewPackType] = useState({ name: "", label: "" });
    const supabase = createClient();

    const refreshSkus = async () => {
        const { data } = await supabase.from("skus").select("*").order("code");
        if (data) setSkus(data);
    };

    const refreshStockLevels = async () => {
        const { data } = await supabase.from("stock_levels").select("*");
        if (data) setStockLevels(data);
    };

    const stockForSku = (skuId: string) =>
        stockLevels.filter((sl) => sl.sku_id === skuId);

    const handleAddSku = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSku.code || !newSku.name) { toast.error("Code and name are required"); return; }
        startTransition(async () => {
            const { data: sku, error } = await supabase.from("skus").insert({
                code: newSku.code, name: newSku.name, category: newSku.category, low_stock_threshold: newSku.threshold,
            }).select().single();
            if (error) { toast.error(error.message); return; }
            if (sku) {
                const activePackTypes = packTypes.filter((pt) => pt.is_active);
                if (activePackTypes.length > 0) {
                    await supabase.from("stock_levels").insert(
                        activePackTypes.map((pt) => ({ sku_id: sku.id, pack_type: pt.name, quantity: 0 }))
                    );
                }
            }
            toast.success("SKU added");
            setShowSkuForm(false);
            setNewSku({ code: "", name: "", category: "Snacks", threshold: 100 });
            await Promise.all([refreshSkus(), refreshStockLevels()]);
        });
    };

    const handleToggleActive = async (sku: SKU) => {
        startTransition(async () => {
            const { error } = await supabase.from("skus").update({ is_active: !sku.is_active }).eq("id", sku.id);
            if (error) { toast.error(error.message); return; }
            toast.success(sku.is_active ? "SKU archived" : "SKU restored");
            await refreshSkus();
        });
    };

    const handleUpdateThreshold = async (sku: SKU) => {
        const t = editingThreshold[sku.id];
        if (t === undefined) return;
        startTransition(async () => {
            const { error } = await supabase.from("skus").update({ low_stock_threshold: t }).eq("id", sku.id);
            if (error) { toast.error(error.message); return; }
            toast.success("Threshold updated");
            setEditingThreshold((prev) => { const n = { ...prev }; delete n[sku.id]; return n; });
            await refreshSkus();
        });
    };

    const handleAddPackType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPackType.name || !newPackType.label) { toast.error("Name and label are required"); return; }
        const safeName = newPackType.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        if (!safeName) { toast.error("Invalid pack type name"); return; }
        startTransition(async () => {
            try {
                await createPackType({ name: safeName, label: newPackType.label });
                toast.success("Pack type added");
                setShowPackTypeForm(false);
                setNewPackType({ name: "", label: "" });
                const { data } = await supabase.from("pack_types").select("*").order("sort_order");
                if (data) setPackTypes(data);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    const handleTogglePackType = async (pt: PackTypeRecord) => {
        startTransition(async () => {
            try {
                await togglePackType(pt.id, pt.is_active);
                toast.success(pt.is_active ? "Pack type deactivated" : "Pack type activated");
                const { data } = await supabase.from("pack_types").select("*").order("sort_order");
                if (data) setPackTypes(data);
            } catch (err: any) { toast.error(err.message); }
        });
    };

    if (!isAdmin) {
        return (
            <div className="px-4 py-10 max-w-md mx-auto text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h2 className="font-serif text-2xl text-brand-heading mb-2">Admin Access Required</h2>
                <p className="text-brand-text/60 text-sm">Only admins can manage SKUs.</p>
            </div>
        );
    }

    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-6">
            {/* SKU List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="section-title">SKU Manager</h2>
                    <button onClick={() => setShowSkuForm(!showSkuForm)} className="btn-pink text-sm py-2 px-4">
                        {showSkuForm ? "Cancel" : "+ Add SKU"}
                    </button>
                </div>

                {showSkuForm && (
                    <form onSubmit={handleAddSku} className="card space-y-4">
                        <h3 className="font-serif text-base">Add New SKU</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Code</label>
                                <input value={newSku.code} onChange={(e) => setNewSku((p) => ({ ...p, code: e.target.value }))} placeholder="KN-XX-35" className="input" />
                            </div>
                            <div>
                                <label className="label">Category</label>
                                <input value={newSku.category} onChange={(e) => setNewSku((p) => ({ ...p, category: e.target.value }))} placeholder="Snacks" className="input" />
                            </div>
                        </div>
                        <div>
                            <label className="label">Name</label>
                            <input value={newSku.name} onChange={(e) => setNewSku((p) => ({ ...p, name: e.target.value }))} placeholder="Chilly Lemony" className="input" />
                        </div>
                        <div>
                            <label className="label">Low Stock Threshold</label>
                            <input type="number" min={1} value={newSku.threshold} onChange={(e) => setNewSku((p) => ({ ...p, threshold: parseInt(e.target.value) || 100 }))} className="input" />
                        </div>
                        <button type="submit" disabled={isPending} className="btn-primary w-full">Add SKU</button>
                    </form>
                )}

                <div className="space-y-2">
                    {skus.length === 0 && <div className="card text-center py-8 text-brand-text/50 text-sm">No SKUs yet</div>}
                    {skus.map((sku) => {
                        const skuStock = stockForSku(sku.id);
                        return (
                            <div key={sku.id} className={`card ${!sku.is_active ? "opacity-50" : ""}`}>
                                <div className="flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-brand-heading text-sm">{sku.name}</span>
                                            <span className="pill bg-gray-100 text-gray-600">{sku.code}</span>
                                            <span className="pill bg-brand-pink/10 text-brand-pink">{sku.category}</span>
                                            {!sku.is_active && <span className="pill bg-gray-100 text-gray-400">Archived</span>}
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-brand-text/50">Threshold:</span>
                                            {editingThreshold[sku.id] !== undefined ? (
                                                <div className="flex items-center gap-1">
                                                    <input type="number" min={1} value={editingThreshold[sku.id]}
                                                        onChange={(e) => setEditingThreshold((p) => ({ ...p, [sku.id]: parseInt(e.target.value) || 100 }))}
                                                        className="w-20 px-2 py-1 text-xs border border-brand-pink rounded-lg focus:outline-none" autoFocus />
                                                    <button onClick={() => handleUpdateThreshold(sku)} disabled={isPending} className="text-xs text-green-600 font-semibold px-2 py-1 hover:bg-green-50 rounded-lg">Save</button>
                                                    <button onClick={() => setEditingThreshold((p) => { const n = { ...p }; delete n[sku.id]; return n; })} className="text-xs text-gray-400 px-2 py-1">Cancel</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setEditingThreshold((p) => ({ ...p, [sku.id]: sku.low_stock_threshold }))}
                                                    className="text-xs text-brand-pink font-semibold hover:underline">
                                                    {sku.low_stock_threshold} units (edit)
                                                </button>
                                            )}
                                        </div>
                                        {skuStock.length > 0 && (
                                            <div className="flex gap-2 mt-2 flex-wrap">
                                                {skuStock.map((sl) => {
                                                    const ptLabel = packTypes.find((pt) => pt.name === sl.pack_type)?.label ?? sl.pack_type;
                                                    return (
                                                        <span key={sl.id} className="text-xs bg-brand-bg border border-brand-border rounded-lg px-2 py-0.5">
                                                            {ptLabel}: <strong>{sl.quantity}</strong>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => handleToggleActive(sku)} disabled={isPending}
                                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${sku.is_active ? "border-red-200 text-red-500 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                                        {sku.is_active ? "Archive" : "Restore"}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Pack Types Management */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="section-title">Pack Types</h2>
                    <button onClick={() => setShowPackTypeForm(!showPackTypeForm)} className="btn-ghost text-sm py-2 px-4">
                        {showPackTypeForm ? "Cancel" : "+ Add"}
                    </button>
                </div>

                {showPackTypeForm && (
                    <form onSubmit={handleAddPackType} className="card space-y-4">
                        <h3 className="font-serif text-base">Add Pack Type</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Name (internal key)</label>
                                <input value={newPackType.name} onChange={(e) => setNewPackType((p) => ({ ...p, name: e.target.value }))}
                                    placeholder="pack_of_3" className="input" />
                                <p className="text-[10px] text-brand-text/40 mt-1">Spaces become underscores, lowercase only</p>
                            </div>
                            <div>
                                <label className="label">Label (display name)</label>
                                <input value={newPackType.label} onChange={(e) => setNewPackType((p) => ({ ...p, label: e.target.value }))}
                                    placeholder="Pack of 3" className="input" />
                            </div>
                        </div>
                        <button type="submit" disabled={isPending} className="btn-primary w-full">Add Pack Type</button>
                    </form>
                )}

                <div className="space-y-2">
                    {packTypes.length === 0 && <div className="card text-center py-6 text-brand-text/50 text-sm">No pack types defined</div>}
                    {packTypes.map((pt) => (
                        <div key={pt.id} className={`card flex items-center gap-3 ${!pt.is_active ? "opacity-50" : ""}`}>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-brand-heading">{pt.label}</p>
                                <p className="text-xs text-brand-text/40 font-mono">{pt.name}</p>
                            </div>
                            <span className={`pill ${pt.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                {pt.is_active ? "Active" : "Inactive"}
                            </span>
                            <button onClick={() => handleTogglePackType(pt)} disabled={isPending}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${pt.is_active ? "border-red-200 text-red-500 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                                {pt.is_active ? "Deactivate" : "Activate"}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/skus/page.tsx app/\(app\)/skus/SkusClient.tsx
git commit -m "feat: SKU manager shows stock inline, pack types management section"
```

---

## Task 12: Verify TypeScript compiles cleanly

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
cd "C:/Users/Raj/OneDrive/Desktop/Claude/3. Inventory management tool/knacks-inventory"
npx tsc --noEmit
```

Expected: No errors. If errors appear, they will be in files that still reference the old `PACK_TYPE_LABELS` constant or the old `WipConversion` field names (`packs_30g_in`, `packs_of_6_out`). Fix each by:
- Replacing `PACK_TYPE_LABELS[x]` with `packTypes.find(pt => pt.name === x)?.label ?? x`
- Replacing `conv.packs_30g_in` with `conv.input_qty` and `conv.packs_of_6_out` with `conv.output_qty`

- [ ] **Step 2: Run build to catch any remaining issues**

```bash
npx next build
```

Expected: Build completes without errors. If you see `PACK_TYPE_LABELS` not found, check `lib/utils/stock.ts` — if it imports from types, update those references.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve remaining TypeScript references to old pack types constants"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|------------|------|
| /skus link in BottomNav between Stalls and Approvals | Task 5 |
| prefetch on all BottomNav links | Task 5 |
| loading.tsx in all route folders | Task 6 |
| pack_types table migration | Task 1 |
| Seed 3 initial pack types | Task 1 |
| Remove check constraint on stock_levels | Task 1 |
| PackTypeRecord type | Task 2 |
| PackType widened to string | Task 2 |
| getPackTypes / createPackType / togglePackType actions | Task 3 |
| Flexible conversion (from/to/input/output) | Task 4, 10 |
| conversions.ts updated for flexible conversion | Task 4 |
| InventoryClient uses dynamic pack types | Task 7 |
| InwardClient uses dynamic pack types | Task 8 |
| OutwardClient uses dynamic pack types | Task 9 |
| StallsClient uses dynamic pack types | Task 10 |
| Flexible WIP conversion form | Task 10 |
| SKU Manager: stock inline per SKU | Task 11 |
| SKU Manager: pack types management section | Task 11 |
| SKU add creates stock_levels for all active pack types | Task 11 |
| wip_conversions table restructured | Task 1 |

All requirements covered. No placeholders found. Type names are consistent throughout (`PackTypeRecord`, `packTypes`, `from_pack_type`, `to_pack_type`, `input_qty`, `output_qty`).
