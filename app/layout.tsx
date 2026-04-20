import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Knacks Inventory",
    description: "Inventory management for Knacks Khakhra",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="font-sans bg-brand-bg min-h-screen">{children}</body>
        </html>
    );
}
