"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface TopBarProps {
    role: string;
    name?: string | null;
}

export default function TopBar({ role, name }: TopBarProps) {
    const router = useRouter();
    const supabase = createClient();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    };

    return (
        <header className="sticky top-0 z-50 bg-brand-bg border-b border-brand-border px-4 py-3 flex items-center justify-between">
            <Link href="/inventory">
                <h1 className="font-serif text-2xl text-brand-heading leading-none">Knacks</h1>
                <p className="text-[10px] text-brand-text/60 leading-none -mt-0.5">Inventory</p>
            </Link>

            <div className="flex items-center gap-2">
                <span className={`pill text-xs ${role === "admin" ? "bg-brand-pink/10 text-brand-pink" : "bg-gray-100 text-gray-600"}`}>
                    {role === "admin" ? "Admin" : "Staff"}
                </span>
                {name && <span className="text-xs text-brand-text hidden sm:block">{name}</span>}
                <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-brand-border transition-colors" title="Sign out">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-text/70">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                </button>
            </div>
        </header>
    );
}
