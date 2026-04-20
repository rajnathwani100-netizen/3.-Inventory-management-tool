"use server";

export async function syncToSheets(batch: any, approverName: string): Promise<void> {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!email || !privateKey || !spreadsheetId) {
        console.log("Google Sheets credentials not configured — skipping sync");
        return;
    }

    const { google } = await import("googleapis");
    const auth = new google.auth.JWT(email, undefined, privateKey, [
        "https://www.googleapis.com/auth/spreadsheets",
    ]);

    const sheets = google.sheets({ version: "v4", auth });
    const sheetName = batch.direction === "inward" ? "Inward Log" : "Outward Log";

    const rows = (batch.batch_items || []).map((item: any) => [
        new Date().toISOString(),
        batch.date,
        item.sku?.code ?? "",
        item.sku?.name ?? "",
        batch.pack_type,
        item.quantity,
        batch.reason,
        batch.notes ?? "",
        approverName,
    ]);

    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:I`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rows },
    });
}
