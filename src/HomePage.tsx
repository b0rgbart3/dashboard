import { useRef, useState } from "react";
import { BarChart3, Upload, Trash2 } from "lucide-react";
import { parse, parseISO, isValid, format } from "date-fns";
import type { EntryType } from "./types";

interface HomePageProps {
  onNavigateToDashboard: () => void;
  message?: string | null;
  onClearMessage?: () => void;
}

const parseFlexibleDate = (input: string): Date | null => {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return parseISO(input);
  const formats = [
    "MM/dd/yyyy", "M/d/yyyy", "MM/dd/yy", "M/d/yy",
    "yyyy/MM/dd", "MMM d, yyyy", "MMMM d, yyyy",
    "d MMM yyyy", "d MMMM yyyy",
  ];
  for (const fmt of formats) {
    try {
      const attempt = parse(input, fmt, new Date());
      if (isValid(attempt)) {
        const year = attempt.getFullYear();
        if (year >= 1900 && year <= new Date().getFullYear()) return attempt;
      }
    } catch {
      // continue
    }
  }
  return null;
};

// Full-document CSV parser — handles multi-line quoted fields and escaped double-quotes.
const parseCSV = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'; // escaped quote: "" → "
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch; // newlines inside quotes are part of the field value
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = "";
      } else if (ch === '\r' && next === '\n') {
        row.push(current.trim());
        current = "";
        rows.push(row);
        row = [];
        i++; // consume the paired \n
      } else if (ch === '\n' || ch === '\r') {
        row.push(current.trim());
        current = "";
        rows.push(row);
        row = [];
      } else {
        current += ch;
      }
    }
  }

  // flush last field/row
  row.push(current.trim());
  if (row.some((c) => c !== "")) rows.push(row);

  // drop completely empty rows
  return rows.filter((r) => r.some((c) => c !== ""));
};

const stripNumeric = (s: string) => s.replace(/[$,()\s]/g, "");

const REQUIRED_COLUMNS = ["activity date", "instrument", "trans code", "quantity", "price"] as const;

const HomePage = ({ onNavigateToDashboard, message, onClearMessage }: HomePageProps) => {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const res = await fetch("http://localhost:5001/api/all", { method: "DELETE" });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setImportStatus("All data deleted.");
    } catch (err) {
      setImportStatus(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setDeleting(false);
    setConfirmDelete(false);
  };

  const handleGlobalCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setImporting(true);
    setImportStatus(null);

    const text = await file.text();
    // Strip BOM if present
    const cleanText = text.replace(/^﻿/, "");
    const rows = parseCSV(cleanText);

    if (rows.length < 2) {
      setImportStatus("File is empty or has no data rows.");
      setImporting(false);
      return;
    }

    // Build column index map from the header row
    const headerCols = rows[0].map((h) => h.toLowerCase().trim());
    const colIndex: Record<string, number> = {};
    for (const required of REQUIRED_COLUMNS) {
      const idx = headerCols.indexOf(required);
      if (idx === -1) {
        setImportStatus(
          `Missing required column: "${required}"\n\nFound columns: ${headerCols.join(", ")}`
        );
        setImporting(false);
        return;
      }
      colIndex[required] = idx;
    }
    // Amount is optional — used as price fallback for dividend rows (CDIV/MDIV)
    const amountIdx = headerCols.indexOf("amount");

    type PendingTransaction = {
      date: string;
      type: EntryType;
      quantity: number;
      price: number;
      ticker: string;
    };

    const entries: PendingTransaction[] = [];
    const errors: string[] = [];
    let skippedCount = 0;

    // Sort data rows chronologically (oldest first) so split ratio computation is correct.
    // Robinhood exports are typically newest-first, so we reverse here.
    const dataRows = rows.slice(1);
    dataRows.sort((a, b) => {
      const dA = parseFlexibleDate(a[colIndex["activity date"]]?.trim() ?? "");
      const dB = parseFlexibleDate(b[colIndex["activity date"]]?.trim() ?? "");
      if (!dA || !dB) return 0;
      return dA.getTime() - dB.getTime();
    });

    const KNOWN_TYPES = new Set(['BUY', 'SELL', 'SLIP', 'MDIV', 'CDIV', 'dividend', 'purchase']);
    // Per-ticker running share count — needed to compute SPL ratio from delta quantity
    const runningQtys: Record<string, number> = {};

    for (let i = 0; i < dataRows.length; i++) {
      const cols = dataRows[i];

      const rawTicker = cols[colIndex["instrument"]]?.trim() ?? "";
      const rawDate   = cols[colIndex["activity date"]]?.trim() ?? "";
      const rawCode   = cols[colIndex["trans code"]]?.trim().toUpperCase() ?? "";
      const rawQty    = cols[colIndex["quantity"]]?.trim() ?? "";
      const rawPrice  = cols[colIndex["price"]]?.trim() ?? "";
      const rawAmount = amountIdx >= 0 ? (cols[amountIdx]?.trim() ?? "") : "";

      // Rows with no instrument or no trans code are summary/spacer rows — skip silently
      const ticker = rawTicker.toUpperCase();
      if (!ticker || !rawCode) { skippedCount++; continue; }

      const parsedDate = parseFlexibleDate(rawDate);
      if (!parsedDate || !isValid(parsedDate)) {
        if (rawDate) errors.push(`Row ${i + 1}: invalid date "${rawDate}"`);
        else skippedCount++;
        continue;
      }
      const date = format(parsedDate, "yyyy-MM-dd");

      // Quantity: use 1 as default when blank (covers dividend events with no share count)
      const qty = rawQty ? parseFloat(stripNumeric(rawQty)) : 1;
      if (isNaN(qty)) {
        errors.push(`Row ${i + 1}: invalid quantity "${rawQty}"`);
        continue;
      }

      // Price: fall back to Amount when Price is blank (CDIV/MDIV rows)
      const priceRaw = rawPrice || rawAmount;
      const price = priceRaw ? parseFloat(stripNumeric(priceRaw)) : 0;
      if (isNaN(price)) {
        errors.push(`Row ${i + 1}: invalid price "${priceRaw}"`);
        continue;
      }

      // --- Stock split handling ---
      if (rawCode === 'SPL') {
        // SPL: quantity = delta (shares added). Ratio = (prior + delta) / prior.
        const priorQty = runningQtys[ticker] ?? 0;
        if (priorQty > 0) {
          const ratio = (priorQty + qty) / priorQty;
          entries.push({ date, type: 'SPLIT', quantity: +ratio.toFixed(8), price: 0, ticker });
          runningQtys[ticker] = priorQty + qty;
        } else {
          errors.push(`Row ${i + 1}: SPL for ${ticker} on ${date} skipped — no prior shares to derive ratio`);
        }
        continue;
      }

      if (rawCode === 'SPR') {
        // SPR always arrives as a consecutive pair: row1 = old total, row2 = new total.
        const nextCols = dataRows[i + 1];
        if (nextCols) {
          const nextCode   = nextCols[colIndex["trans code"]]?.trim().toUpperCase();
          const nextTicker = nextCols[colIndex["instrument"]]?.trim().toUpperCase();
          const nextDate   = nextCols[colIndex["activity date"]]?.trim();
          const nextQtyRaw = nextCols[colIndex["quantity"]]?.trim() ?? "";
          const nextQty    = nextQtyRaw ? parseFloat(stripNumeric(nextQtyRaw)) : NaN;
          if (nextCode === 'SPR' && nextTicker === ticker && nextDate === rawDate && !isNaN(nextQty) && qty > 0) {
            const ratio = nextQty / qty;
            entries.push({ date, type: 'SPLIT', quantity: +ratio.toFixed(8), price: 0, ticker });
            runningQtys[ticker] = nextQty;
            i++; // consume the second SPR row
            continue;
          }
        }
        errors.push(`Row ${i + 1}: unpaired SPR for ${ticker} on ${date} — skipped`);
        continue;
      }

      if (!KNOWN_TYPES.has(rawCode)) {
        skippedCount++;
        continue;
      }

      // Update running qty tracker for normal transactions
      if (rawCode === 'BUY' || rawCode === 'purchase') runningQtys[ticker] = (runningQtys[ticker] ?? 0) + qty;
      else if (rawCode === 'SELL') runningQtys[ticker] = (runningQtys[ticker] ?? 0) - qty;

      entries.push({
        date,
        type: rawCode as EntryType,
        quantity: qty,
        price,
        ticker,
      });
    }

    if (entries.length === 0) {
      const colMapStr = REQUIRED_COLUMNS.map((c) => `${c} → col ${colIndex[c]}`).join(", ");
      let msg = `Nothing imported from ${rows.length - 1} data row(s).\n\n`;
      msg += `Detected columns: ${colMapStr}\n`;
      msg += `Silently skipped (no instrument/trans code): ${skippedCount}\n`;
      if (errors.length > 0) msg += `\nRow errors:\n${errors.join("\n")}`;
      else msg += `No row errors — all rows were silently skipped.`;
      setImportStatus(msg);
      setImporting(false);
      return;
    }

    try {
      const stocksRes = await fetch("http://localhost:5001/api/stocks");
      const existingStocks: { ticker: string }[] = await stocksRes.json();
      const existingTickers = new Set(existingStocks.map((s) => s.ticker.toUpperCase()));

      const uniqueTickers = [...new Set(entries.map((e) => e.ticker))];
      const today = new Date().toISOString().split("T")[0];
      for (const ticker of uniqueTickers) {
        if (!existingTickers.has(ticker)) {
          await fetch("http://localhost:5001/api/stocks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: ticker, ticker, name: ticker, createdAt: today }),
          });
        }
      }

      const withIds = entries.map((e, i) => ({ ...e, id: Date.now() + i }));
      const importRes = await fetch("http://localhost:5001/api/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withIds),
      });

      if (!importRes.ok) throw new Error(`Server error: ${importRes.status}`);

      const tickerCounts = entries.reduce<Record<string, number>>((acc, e) => {
        acc[e.ticker] = (acc[e.ticker] ?? 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(tickerCounts)
        .map(([t, n]) => `${t}: ${n}`)
        .join(", ");

      let status = `Imported ${entries.length} transaction${entries.length !== 1 ? "s" : ""} across ${uniqueTickers.length} ticker${uniqueTickers.length !== 1 ? "s" : ""} (${summary}).`;
      if (skippedCount > 0) status += `\nSkipped ${skippedCount} non-transaction row(s).`;
      if (errors.length > 0) status += `\n\nRow errors (${errors.length}):\n${errors.join("\n")}`;
      setImportStatus(status);
      onClearMessage?.();
    } catch (err) {
      setImportStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    setImporting(false);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "2rem",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>
          Moon-Math Dashboard
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem" }}>
          Track your stock accumulation and dividends
        </p>
      </div>

      {message && (
        <div
          style={{
            maxWidth: "480px",
            padding: "0.85rem 1.25rem",
            borderRadius: "10px",
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            color: "var(--text-primary)",
            fontSize: "0.95rem",
            textAlign: "center",
          }}
        >
          {message}
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={onNavigateToDashboard}
          className="btn btn-primary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 32px",
            fontSize: "1rem",
            borderRadius: "12px",
          }}
        >
          <BarChart3 size={20} />
          Open Dashboard
        </button>

        <button
          onClick={() => csvInputRef.current?.click()}
          disabled={importing}
          className="btn btn-secondary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 32px",
            fontSize: "1rem",
            borderRadius: "12px",
          }}
        >
          <Upload size={20} />
          {importing ? "Importing…" : "Import CSV"}
        </button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv"
          onChange={handleGlobalCSVImport}
          style={{ display: "none" }}
        />

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="btn btn-secondary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "14px 32px",
              fontSize: "1rem",
              borderRadius: "12px",
              color: "var(--color-error, #e53e3e)",
              borderColor: "var(--color-error, #e53e3e)",
            }}
          >
            <Trash2 size={20} />
            Delete All Data
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
              Delete all stocks and transactions?
            </span>
            <button
              onClick={handleDeleteAll}
              disabled={deleting}
              className="btn btn-primary"
              style={{ padding: "10px 20px", fontSize: "0.95rem", borderRadius: "10px", background: "#e53e3e", borderColor: "#e53e3e" }}
            >
              {deleting ? "Deleting…" : "Yes, delete everything"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="btn btn-secondary"
              style={{ padding: "10px 20px", fontSize: "0.95rem", borderRadius: "10px" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {importStatus && (
        <div
          style={{
            maxWidth: "560px",
            padding: "1rem 1.25rem",
            borderRadius: "10px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            fontSize: "0.9rem",
            whiteSpace: "pre-wrap",
            textAlign: "left",
            lineHeight: "1.5",
          }}
        >
          {importStatus}
        </div>
      )}
    </div>
  );
};

export default HomePage;
