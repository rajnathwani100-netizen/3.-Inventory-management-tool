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

export default function BottomNav({ role, pendingCount = 0 }: BottomNavProps) {
    const pathname = usePathname();

    const allItems =
        role === "admin"
            ? [
                ...navItems,
                {
                    href: "/approvals",
                    label: "Approvals",
                    icon: (active: boolean) => (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#EB2676" : "#3B1D0680"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    ),
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
                        <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 py-2 px-3 relative min-w-0 flex-1">
                            <div className="relative">
                                {item.icon(active)}
                                {"badge" in item && item.badge > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-brand-pink text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                        {item.badge > 9 ? "9+" : item.badge}
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
