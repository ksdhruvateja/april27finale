import { useRef } from "react";
import { Printer } from "lucide-react";

interface CheckData {
  payToOrder: string;
  amount: number;
  date: string;
  checkNumber: string;
  memo: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  payerName: string;
  payerAddress: string;
}

function numberToWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function belowThousand(num: number): string {
    if (num === 0) return "";
    if (num < 20) return ones[num] + " ";
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? "-" + ones[num % 10] : "") + " ";
    return ones[Math.floor(num / 100)] + " Hundred " + belowThousand(num % 100);
  }

  const dollars = Math.floor(n);
  const cents = Math.round((n - dollars) * 100);
  let result = "";
  if (dollars >= 1_000_000) result += belowThousand(Math.floor(dollars / 1_000_000)) + "Million ";
  if (dollars >= 1_000) result += belowThousand(Math.floor((dollars % 1_000_000) / 1_000)) + "Thousand ";
  result += belowThousand(dollars % 1_000);
  result = result.trim() || "Zero";
  return result + " and " + cents.toString().padStart(2, "0") + "/100 Dollars";
}

function formatCheckDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

interface Props {
  data: CheckData;
  onPrint: () => void;
}

export default function CheckPrintView({ data, onPrint }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const w = window.open("", "_blank", "width=900,height=500");
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Check #${data.checkNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Times New Roman', serif; background: white; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
    onPrint();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors"
        >
          <Printer size={14} /> Print Check & Mark Paid
        </button>
      </div>

      {/* Check preview */}
      <div ref={printRef}>
        <div style={{
          width: "100%",
          maxWidth: "760px",
          margin: "0 auto",
          border: "1px solid #999",
          padding: "20px 24px 16px",
          fontFamily: "'Times New Roman', serif",
          background: "white",
          position: "relative",
          minHeight: "220px",
        }}>
          {/* Top row: payer + check number */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <div>
              <div style={{ fontSize: "17px", fontWeight: "bold", letterSpacing: "0.5px" }}>{data.payerName}</div>
              <div style={{ fontSize: "11px", color: "#444", whiteSpace: "pre-line" }}>{data.payerAddress}</div>
              <div style={{ fontSize: "11px", color: "#444", marginTop: "2px" }}>{data.bankName}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#555", marginBottom: "2px" }}>CHECK NO.</div>
              <div style={{ fontSize: "16px", fontWeight: "bold", letterSpacing: "1px" }}>{data.checkNumber || "______"}</div>
            </div>
          </div>

          {/* Date row */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px" }}>DATE</span>
              <span style={{ borderBottom: "1px solid #333", minWidth: "180px", fontSize: "12px", padding: "0 4px" }}>
                {data.date ? formatCheckDate(data.date) : "___________________"}
              </span>
            </div>
          </div>

          {/* Pay to line */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", whiteSpace: "nowrap" }}>PAY TO THE ORDER OF</span>
            <span style={{ borderBottom: "1px solid #333", flex: 1, fontSize: "13px", fontWeight: "bold", padding: "0 4px" }}>
              {data.payToOrder}
            </span>
            <span style={{ border: "1px solid #333", padding: "2px 10px", fontSize: "14px", fontWeight: "bold", whiteSpace: "nowrap" }}>
              ${data.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Amount in words */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <span style={{ borderBottom: "1px solid #333", flex: 1, fontSize: "12px", padding: "0 4px" }}>
              {numberToWords(data.amount)}
            </span>
            <span style={{ fontSize: "11px", whiteSpace: "nowrap" }}>DOLLARS</span>
          </div>

          {/* Memo + Signature row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "10px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: "#555" }}>MEMO</div>
              <div style={{ borderBottom: "1px solid #333", fontSize: "12px", padding: "0 4px", minWidth: "200px" }}>
                {data.memo}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ borderBottom: "1px solid #333", minWidth: "220px", marginBottom: "2px" }}>&nbsp;</div>
              <div style={{ fontSize: "11px", color: "#555", textAlign: "center" }}>AUTHORIZED SIGNATURE</div>
            </div>
          </div>

          {/* MICR line */}
          <div style={{
            marginTop: "16px",
            borderTop: "1px solid #ccc",
            paddingTop: "8px",
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#333",
            letterSpacing: "2px",
            display: "flex",
            justifyContent: "space-between",
          }}>
            <span>⑆{data.routingNumber || "000000000"}⑆  {data.accountNumber || "0000000000"}⑈</span>
            <span>{data.checkNumber || "0000"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
