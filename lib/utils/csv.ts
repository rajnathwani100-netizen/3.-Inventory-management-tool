export function generateCSV(
    rows: Record<string, string | number | null | undefined>[],
    filename: string
) {
    if (rows.length === 0) return;

    const headers = Object.keys(rows[0]);
    const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
            headers
                .map((h) => {
                    const val = row[h] ?? "";
                    const str = String(val);
                    return str.includes(",") || str.includes('"') || str.includes("\n")
                        ? `"${str.replace(/"/g, '""')}"`
                        : str;
                })
                .join(",")
        ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function formatDateForFilename(date: Date = new Date()): string {
    return date.toISOString().split("T")[0];
}
