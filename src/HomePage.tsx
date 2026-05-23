import { useRef, useState, useEffect, useMemo } from "react";
import { BarChart3, Upload, Trash2, RefreshCw } from "lucide-react";
import { parse, parseISO, isValid, format } from "date-fns";
import type { EntryType, Stock, StockSummary } from "./types";

interface HomePageProps {
  onNavigateToDashboard: (ticker?: string) => void;
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

function formatHeldDuration(date: string | null): string {
  if (!date) return "—";
  const start = new Date(date);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}mo`);
  return parts.length > 0 ? parts.join(" ") : "< 1mo";
}

const REQUIRED_COLUMNS = ["activity date", "instrument", "trans code", "quantity", "price"] as const;

type SortKey = "ticker" | "name" | "totalValue" | "totalGain" | "gainPct" | "annualGainPct" | "dividends" | "slipIncome" | "purchaseDate" | "rating";

const HomePage = ({ onNavigateToDashboard, message, onClearMessage }: HomePageProps) => {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, StockSummary>>({});
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [summariesLoaded, setSummariesLoaded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [refreshing, setRefreshing] = useState(false);

  const handleSort = (key: SortKey, defaultDir: "asc" | "desc") => {
    if (key === sortKey) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(defaultDir);
    }
  };

  useEffect(() => {
    Promise.all([
      fetch("http://localhost:5001/api/stocks").then((r) => r.json()),
      fetch("http://localhost:5001/api/stocks/summary").then((r) => r.json()),
    ]).then(([stocksData, summaryData]: [Stock[], Record<string, StockSummary>]) => {
      setStocks(stocksData);
      setSummaries(summaryData);
      setSummariesLoaded(true);
      // Auto-update stocks whose name is just the ticker, or that are missing shortName
      (stocksData as Stock[]).filter(s => s.name === s.ticker || !s.shortName).forEach(async (stock) => {
        try {
          const res = await fetch(`http://localhost:5001/api/lookup/${stock.ticker}`);
          if (!res.ok) return;
          const { name, shortName } = await res.json() as { name: string; shortName: string };
          const patch: Record<string, string> = {};
          if (name && name !== stock.ticker && name !== stock.name) patch.name = name;
          if (shortName && shortName !== stock.shortName) patch.shortName = shortName;
          if (Object.keys(patch).length > 0) {
            setStocks(prev => prev.map(s => s.ticker === stock.ticker ? { ...s, ...patch } : s));
            fetch(`http://localhost:5001/api/stocks/${stock.ticker}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            }).catch(() => {});
          }
        } catch { /* ignore */ }
      });
    }).catch(() => setSummariesLoaded(true));
  }, []);

  const tableRows = useMemo(() => {
    const rows = Object.entries(summaries)
      .filter(([, s]) => s.totalShares > 0 && s.marketValue > 1000)
      .map(([ticker, s]) => ({
        ticker,
        name: (() => { const st = stocks.find(s => s.ticker === ticker); return st?.shortName ?? st?.name ?? ticker; })(),
        totalValue: s.marketValue,
        totalGain: s.totalReturn,
        totalInvested: s.totalInvested,
        dividends: s.dividendIncome,
        ytdDividends: s.ytdDividendIncome ?? 0,
        slipIncome: s.slipIncome,
        ytdSlipIncome: s.ytdSlipIncome ?? 0,
        gainPct: s.totalInvested > 0 ? (s.totalReturn / s.totalInvested) * 100 : 0,
        yearsHeld: s.earliestPurchaseDate
          ? (Date.now() - new Date(s.earliestPurchaseDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
          : null,
        annualGainPct: (() => {
          if (!s.earliestPurchaseDate || s.totalInvested <= 0) return null;
          const years = (Date.now() - new Date(s.earliestPurchaseDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
          if (years < 1 / 12) return null;
          const factor = 1 + s.totalReturn / s.totalInvested;
          if (factor <= 0) return null;
          return (Math.pow(factor, 1 / years) - 1) * 100;
        })(),
        lengthHeld: formatHeldDuration(s.earliestPurchaseDate),
        purchaseDate: s.earliestPurchaseDate,
        rating: s.rating,
      }));

    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
        case "name":   cmp = a.name.localeCompare(b.name); break;
        case "totalValue": cmp = a.totalValue - b.totalValue; break;
        case "totalGain":  cmp = a.totalGain - b.totalGain; break;
        case "gainPct":       cmp = a.gainPct - b.gainPct; break;
        case "annualGainPct": cmp = (a.annualGainPct ?? -Infinity) - (b.annualGainPct ?? -Infinity); break;
        case "dividends":     cmp = a.dividends - b.dividends; break;
        case "slipIncome":    cmp = a.slipIncome - b.slipIncome; break;
        case "purchaseDate": {
          const dA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : Infinity;
          const dB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : Infinity;
          cmp = dA - dB;
          break;
        }
        case "rating":
          cmp = (a.rating ?? -1) - (b.rating ?? -1);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [summaries, stocks, sortKey, sortDir]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("http://localhost:5001/api/stocks/summary/refresh", { method: "POST" });
      const [stocksData, summaryData] = await Promise.all([
        fetch("http://localhost:5001/api/stocks").then((r) => r.json()),
        fetch("http://localhost:5001/api/stocks/summary").then((r) => r.json()),
      ]);
      setStocks(stocksData);
      setSummaries(summaryData);
    } catch {
      // silently fail — stale data is still shown
    }
    setRefreshing(false);
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const res = await fetch("http://localhost:5001/api/all", { method: "DELETE" });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setSummaries({});
      setStocks([]);
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
    const mrgsTickers = new Set<string>();

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
        // SPR arrives as a consecutive pair showing the pre-split and post-split totals.
        // Export order is not guaranteed, so we use the running qty to identify which
        // row is the pre-split total (should be closest to our tracked running count).
        const nextCols = dataRows[i + 1];
        if (nextCols) {
          const nextCode   = nextCols[colIndex["trans code"]]?.trim().toUpperCase();
          const nextTicker = nextCols[colIndex["instrument"]]?.trim().toUpperCase();
          const nextDate   = nextCols[colIndex["activity date"]]?.trim();
          const nextQtyRaw = nextCols[colIndex["quantity"]]?.trim() ?? "";
          const nextQty    = nextQtyRaw ? parseFloat(stripNumeric(nextQtyRaw)) : NaN;
          if (nextCode === 'SPR' && nextTicker === ticker && nextDate === rawDate && !isNaN(nextQty) && qty > 0) {
            const priorQty = runningQtys[ticker] ?? 0;
            // Identify which value is the pre-split total by proximity to running qty
            let oldQty: number, newQty: number;
            if (priorQty > 0 && Math.abs(nextQty - priorQty) < Math.abs(qty - priorQty)) {
              oldQty = nextQty; newQty = qty;
            } else {
              oldQty = qty; newQty = nextQty;
            }
            const ratio = oldQty > 0 ? +(newQty / oldQty).toFixed(8) : 1;
            entries.push({ date, type: 'SPLIT', quantity: ratio, price: 0, ticker });
            runningQtys[ticker] = newQty;
            i++; // consume the second SPR row
            continue;
          }
        }
        errors.push(`Row ${i + 1}: unpaired SPR for ${ticker} on ${date} — skipped`);
        continue;
      }

      if (rawCode === 'MRGS') {
        mrgsTickers.add(ticker);
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

    // Remove all entries for tickers that had a MRGS (merger) event — unsupported complexity
    if (mrgsTickers.size > 0) {
      const before = entries.length;
      entries.splice(0, entries.length, ...entries.filter((e) => !mrgsTickers.has(e.ticker)));
      const removed = before - entries.length;
      if (removed > 0) skippedCount += removed;
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
          let name = ticker;
          let shortName: string | undefined;
          try {
            const lookupRes = await fetch(`http://localhost:5001/api/lookup/${ticker}`);
            if (lookupRes.ok) {
              const lookupData = await lookupRes.json() as { name: string; shortName?: string };
              if (lookupData.name && lookupData.name !== ticker) name = lookupData.name;
              if (lookupData.shortName) shortName = lookupData.shortName;
            }
          } catch { /* fall back to ticker */ }
          await fetch("http://localhost:5001/api/stocks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: ticker, ticker, name, shortName, createdAt: today }),
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
      if (mrgsTickers.size > 0) status += `\nExcluded ${mrgsTickers.size} ticker(s) with MRGS (merger) transactions — not yet supported: ${[...mrgsTickers].sort().join(", ")}.`;
      if (errors.length > 0) status += `\n\nRow errors (${errors.length}):\n${errors.join("\n")}`;
      setImportStatus(status);
      onClearMessage?.();

      await fetch("http://localhost:5001/api/stocks/summary/refresh", { method: "POST" });
      const [refreshedStocks, refreshedSummary] = await Promise.all([
        fetch("http://localhost:5001/api/stocks").then((r) => r.json()),
        fetch("http://localhost:5001/api/stocks/summary").then((r) => r.json()),
      ]);
      setStocks(refreshedStocks);
      setSummaries(refreshedSummary);
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
          onClick={() => onNavigateToDashboard()}
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

        {summariesLoaded && tableRows.length > 0 && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
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
            <RefreshCw size={20} style={refreshing ? { animation: "spin 1s linear infinite" } : undefined} />
            {refreshing ? "Refreshing…" : "Refresh Prices"}
          </button>
        )}

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

      {(!summariesLoaded || importing) && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          <div className="spinner" />
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            {importing ? "Importing transactions…" : "Rating portfolio…"}
          </span>
        </div>
      )}

      {summariesLoaded && !importing && tableRows.length > 0 && (
        <div style={{ width: "100%", maxWidth: "960px" }}>
          <h2 style={{ fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "0.75rem", textAlign: "center", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Portfolio Summary
          </h2>
          <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", tableLayout: "auto" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {([
                    { label: "Ticker",     key: "ticker",       align: "left",  defaultDir: "asc"  },
                    { label: "Name",       key: "name",         align: "left",  defaultDir: "asc"  },
                    { label: "Value",      key: "totalValue",   align: "right", defaultDir: "desc" },
                    { label: "G/L $",      key: "totalGain",    align: "right", defaultDir: "desc" },
                    { label: "Total %",    key: "gainPct",       align: "right", defaultDir: "desc" },
                    { label: "Annual %",   key: "annualGainPct", align: "right", defaultDir: "desc" },
                    { label: "Divs",       key: "dividends",     align: "right", defaultDir: "desc" },
                    { label: "Cash",       key: "slipIncome",    align: "right", defaultDir: "desc" },
                    { label: "Held",         key: "purchaseDate",  align: "right", defaultDir: "desc" },
                    { label: "Rating",     key: "rating",       align: "right", defaultDir: "desc" },
                  ] as { label: string; key: SortKey; align: "left" | "right"; defaultDir: "asc" | "desc" }[]).map(({ label, key, align, defaultDir }) => {
                    const active = sortKey === key;
                    return (
                      <th
                        key={key}
                        onClick={() => handleSort(key, defaultDir)}
                        style={{
                          padding: "8px 8px",
                          textAlign: align,
                          color: active ? "var(--text-primary)" : "var(--text-secondary)",
                          fontWeight: active ? 700 : 500,
                          fontSize: "0.78rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        {label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => {
                  const gainColor = row.totalGain > 5000 ? "#00ff88" : row.totalGain >= 0 ? "var(--success-green)" : "#ef4444";
                  const ratingColor = row.rating === null ? "var(--text-secondary)"
                    : row.rating >= 7 ? "var(--success-green)"
                    : row.rating >= 4 ? "#f59e0b"
                    : "#ef4444";
                  return (
                    <tr
                      key={row.ticker}
                      style={{ borderBottom: i < tableRows.length - 1 ? "1px solid var(--border)" : undefined, cursor: "pointer", transition: "background 0.15s" }}
                      onClick={() => onNavigateToDashboard(row.ticker)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td style={{ padding: "8px 8px", fontWeight: 700, color: "var(--text-primary)" }}>{row.ticker}</td>
                      <td style={{ padding: "8px 8px", color: "var(--text-secondary)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: "var(--text-primary)" }}>
                        ${row.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: gainColor, fontWeight: 600 }}>
                        {row.totalGain >= 0 ? "+" : "-"}${Math.abs(row.totalGain).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: gainColor }}>
                        {row.gainPct >= 0 ? "+" : ""}{row.gainPct.toFixed(1)}%
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: row.annualGainPct == null ? "var(--text-secondary)" : row.annualGainPct >= 0 ? gainColor : "#ef4444" }}>
                        {row.annualGainPct == null ? "—" : `${row.annualGainPct >= 0 ? "+" : ""}${row.annualGainPct.toFixed(1)}%`}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: row.dividends > 0 ? "var(--success-green)" : "var(--text-secondary)" }}>
                        {row.dividends > 0 ? `$${row.dividends.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: row.slipIncome > 0 ? "var(--success-green)" : "var(--text-secondary)" }}>
                        {row.slipIncome > 0 ? `$${row.slipIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: "var(--text-secondary)" }}>{row.lengthHeld}</td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: ratingColor, fontWeight: 700 }}>
                        {row.rating !== null ? `${row.rating} / 10` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const totalValue    = tableRows.reduce((sum, r) => sum + r.totalValue, 0);
                  const totalGain     = tableRows.reduce((sum, r) => sum + r.totalGain, 0);
                  const totalInvested  = tableRows.reduce((sum, r) => sum + r.totalInvested, 0);
                  const totalDividends = tableRows.reduce((sum, r) => sum + r.dividends, 0);
                  const totalYtdDividends = tableRows.reduce((sum, r) => sum + r.ytdDividends, 0);
                  const now = new Date();
                  const monthsElapsed = now.getMonth() + 1 + now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - 1;
                  const ytdPerMonth = monthsElapsed > 0 ? totalYtdDividends / monthsElapsed : 0;
                  const totalSlip      = tableRows.reduce((sum, r) => sum + r.slipIncome, 0);
                  const totalYtdSlip   = tableRows.reduce((sum, r) => sum + r.ytdSlipIncome, 0);
                  const totalGainPct  = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
                  const glColor       = totalGain >= 0 ? "var(--success-green)" : "#ef4444";
                  const rowsWithAnnual = tableRows.filter(r => r.annualGainPct != null && r.yearsHeld != null);
                  const wNum = rowsWithAnnual.reduce((sum, r) => sum + r.annualGainPct! * r.totalInvested * r.yearsHeld!, 0);
                  const wDen = rowsWithAnnual.reduce((sum, r) => sum + r.totalInvested * r.yearsHeld!, 0);
                  const weightedAnnualGainPct = wDen > 0 ? wNum / wDen : null;
                  const simpleAnnualGainPct = rowsWithAnnual.length > 0
                    ? rowsWithAnnual.reduce((sum, r) => sum + r.annualGainPct!, 0) / rowsWithAnnual.length
                    : null;
                  const longestHeld   = tableRows.reduce<typeof tableRows[number] | null>((oldest, r) => {
                    if (!r.purchaseDate) return oldest;
                    if (!oldest?.purchaseDate) return r;
                    return r.purchaseDate < oldest.purchaseDate ? r : oldest;
                  }, null);
                  return (
                    <tr style={{ borderTop: "2px solid rgba(255,255,255,0.2)" }}>
                      <td colSpan={2} style={{ padding: "8px 8px", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-primary)" }}>
                        Total
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>
                        ${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, color: glColor }}>
                        {totalGain >= 0 ? "+" : "-"}${Math.abs(totalGain).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, color: glColor }}>
                        {totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(1)}%
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: weightedAnnualGainPct == null ? "var(--text-secondary)" : weightedAnnualGainPct >= 0 ? glColor : "#ef4444" }}>
                          {weightedAnnualGainPct == null ? "—" : `${weightedAnnualGainPct >= 0 ? "+" : ""}${weightedAnnualGainPct.toFixed(1)}%`}
                          <span style={{ fontSize: "0.65rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "3px" }}>wtd</span>
                        </div>
                        <div style={{ fontSize: "0.78rem", color: simpleAnnualGainPct == null ? "var(--text-secondary)" : simpleAnnualGainPct >= 0 ? glColor : "#ef4444" }}>
                          {simpleAnnualGainPct == null ? "—" : `${simpleAnnualGainPct >= 0 ? "+" : ""}${simpleAnnualGainPct.toFixed(1)}%`}
                          <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginLeft: "3px" }}>avg</span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: totalDividends > 0 ? "var(--success-green)" : "var(--text-secondary)" }}>
                          {totalDividends > 0 ? `$${totalDividends.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                        </div>
                        {totalYtdDividends > 0 && (
                          <>
                            <div style={{ fontSize: "0.78rem", color: "var(--success-green)" }}>
                              {`$${totalYtdDividends.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                              <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginLeft: "3px" }}>ytd</span>
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "var(--success-green)" }}>
                              {`$${ytdPerMonth.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                              <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginLeft: "3px" }}>/mo</span>
                            </div>
                          </>
                        )}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: totalSlip > 0 ? "var(--success-green)" : "var(--text-secondary)" }}>
                          {totalSlip > 0 ? `$${totalSlip.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                        </div>
                        {totalYtdSlip > 0 && (
                          <div style={{ fontSize: "0.78rem", color: "var(--success-green)" }}>
                            {`$${totalYtdSlip.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                            <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginLeft: "3px" }}>ytd</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "8px 8px", textAlign: "right", color: "var(--text-secondary)" }}>
                        {longestHeld ? longestHeld.lengthHeld : "—"}
                      </td>
                      <td />
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      )}

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
