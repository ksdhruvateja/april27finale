function escapeCsv(value: unknown): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<unknown>>,
): void {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadPdfFromHtml(title: string, tableHtml: string): void {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return;
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 0 0 16px; color: #6b7280; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
      th { background: #f3f4f6; font-weight: 700; }
      @media print { @page { size: A4 landscape; margin: 12mm; } }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p>Generated on ${new Date().toLocaleString()}</p>
    ${tableHtml}
  </body>
</html>`;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}
