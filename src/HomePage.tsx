import React, { useRef, useState, useEffect, type RefObject } from "react";
import { BarChart3, Upload, Trash2, RefreshCw, Menu, X } from "lucide-react";
import type { Stock, StockSummary, FilterValue } from "./types";
import { usePortfolioSort } from "./hooks/usePortfolioSort";
import { parseCSV } from "./utils/csvParsing";
import { REQUIRED_COLUMNS, API_BASE } from "./utils/portfolioUtils";
import { parseRobinhoodCSV, submitImport } from "./services/csvImportService";
import PortfolioTable from "./components/PortfolioTable";
import PortfolioCharts from "./components/PortfolioCharts";
import * as styles from "./homePageStyles";

const TECH_STACK = [
  "React 19",
  "TypeScript",
  "Vite",
  "Express 5",
  "Recharts",
  "Yahoo Finance",
  "Lucide",
];

interface HomePageProps {
  onNavigateToDashboard: (ticker?: string) => void;
  message?: string | null;
  onClearMessage?: () => void;
  filterStatus: "all" | "active" | "inactive";
  onFilterStatusChange: (v: "all" | "active" | "inactive") => void;
  filterValue: FilterValue;
  onFilterValueChange: (v: FilterValue) => void;
  filterDividends: "all" | "yes" | "no";
  onFilterDividendsChange: (v: "all" | "yes" | "no") => void;
  stocks: Stock[];
  onStocksChange: React.Dispatch<React.SetStateAction<Stock[]>>;
  summaries: Record<string, StockSummary>;
  onSummariesChange: React.Dispatch<
    React.SetStateAction<Record<string, StockSummary>>
  >;
  portfolioLoaded: boolean;
  lookedUpTickers: RefObject<Set<string>>;
  onTransactionCacheChange: React.Dispatch<
    React.SetStateAction<Record<string, import("./types").Transaction[]>>
  >;
}

const HomePage = ({
  onNavigateToDashboard,
  message,
  onClearMessage,
  filterStatus,
  onFilterStatusChange,
  filterValue,
  onFilterValueChange,
  filterDividends,
  onFilterDividendsChange,
  stocks,
  onStocksChange,
  summaries,
  onSummariesChange,
  portfolioLoaded,
  lookedUpTickers,
  onTransactionCacheChange,
}: HomePageProps) => {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { tableRows, sortKey, handleSort } = usePortfolioSort(
    summaries,
    stocks,
    filterStatus,
    filterValue,
    filterDividends,
  );

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!portfolioLoaded) return;
    stocks
      .filter(
        (s) =>
          (s.name === s.ticker || !s.shortName) &&
          !lookedUpTickers.current?.has(s.ticker),
      )
      .forEach(async (stock) => {
        lookedUpTickers.current?.add(stock.ticker);
        try {
          const res = await fetch(`${API_BASE}/api/lookup/${stock.ticker}`);
          if (!res.ok) return;
          const { name, shortName } = (await res.json()) as {
            name: string;
            shortName: string;
          };
          const patch: Record<string, string> = {};
          if (name && name !== stock.ticker && name !== stock.name)
            patch.name = name;
          if (shortName && shortName !== stock.shortName)
            patch.shortName = shortName;
          if (Object.keys(patch).length > 0) {
            onStocksChange((prev) =>
              prev.map((s) =>
                s.ticker === stock.ticker ? { ...s, ...patch } : s,
              ),
            );
            fetch(`${API_BASE}/api/stocks/${stock.ticker}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            }).catch(() => {});
          }
        } catch {
          /* ignore */
        }
      });
  }, [portfolioLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`${API_BASE}/api/stocks/summary/refresh`, { method: "POST" });
      const [stocksData, summaryData] = await Promise.all([
        fetch(`${API_BASE}/api/stocks`).then((r) => r.json()),
        fetch(`${API_BASE}/api/stocks/summary`).then((r) => r.json()),
      ]);
      onStocksChange(stocksData);
      onSummariesChange(summaryData);
    } catch {
      // silently fail — stale data is still shown
    }
    setRefreshing(false);
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/all`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      onSummariesChange({});
      onStocksChange([]);
      onTransactionCacheChange({});
      setImportStatus("All data deleted.");
    } catch (err) {
      setImportStatus(
        `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setDeleting(false);
    setConfirmDelete(false);
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setImportStatus(null);
    setImportLog("Reading file…");

    const text = await file.text();
    const cleanText = text.replace(/^﻿/, "");
    const rows = parseCSV(cleanText);

    if (rows.length < 2) {
      setImportStatus("File is empty or has no data rows.");
      setImporting(false);
      return;
    }

    const headerCols = rows[0].map((h) => h.toLowerCase().trim());
    const colIndex: Record<string, number> = {};
    for (const required of REQUIRED_COLUMNS) {
      const idx = headerCols.indexOf(required);
      if (idx === -1) {
        setImportStatus(
          `Missing required column: "${required}"\n\nFound columns: ${headerCols.join(", ")}`,
        );
        setImporting(false);
        return;
      }
      colIndex[required] = idx;
    }
    const amountIdx = headerCols.indexOf("amount");
    const descIdx = headerCols.indexOf("description");

    const { entries, errors, skippedCount, skippedCodes } = parseRobinhoodCSV(
      rows,
      colIndex,
      amountIdx,
      descIdx,
    );
    setImportLog(
      `Parsed ${rows.length - 1} rows → ${entries.length} transaction${entries.length !== 1 ? "s" : ""} across ${[...new Set(entries.map((e) => e.ticker))].length} tickers`,
    );

    if (entries.length === 0) {
      const colMapStr = REQUIRED_COLUMNS.map(
        (c) => `${c} → col ${colIndex[c]}`,
      ).join(", ");
      let msg = `Nothing imported from ${rows.length - 1} data row(s).\n\n`;
      msg += `Detected columns: ${colMapStr}\n`;
      msg += `Silently skipped (no instrument/trans code): ${skippedCount}\n`;
      msg +=
        errors.length > 0
          ? `\nRow errors:\n${errors.join("\n")}`
          : `No row errors — all rows were silently skipped.`;
      setImportStatus(msg);
      setImporting(false);
      return;
    }

    try {
      const { stocksData, summaryData, duplicatesSkipped } = await submitImport(
        entries,
        setImportLog,
      );

      const insertedCount = entries.length - duplicatesSkipped;
      const uniqueTickers = [...new Set(entries.map((e) => e.ticker))];
      const tickerCounts = entries.reduce<Record<string, number>>((acc, e) => {
        acc[e.ticker] = (acc[e.ticker] ?? 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(tickerCounts)
        .map(([t, n]) => `${t}: ${n}`)
        .join(", ");

      let status = `Imported ${insertedCount} transaction${insertedCount !== 1 ? "s" : ""} across ${uniqueTickers.length} ticker${uniqueTickers.length !== 1 ? "s" : ""} (${summary}).`;
      if (duplicatesSkipped > 0)
        status += `\nSkipped ${duplicatesSkipped} duplicate${duplicatesSkipped !== 1 ? "s" : ""} already in the database.`;
      if (skippedCount > 0)
        status += `\nSkipped ${skippedCount} non-transaction row(s).`;
      if (skippedCodes.size > 0) {
        const codeSummary = [...skippedCodes.entries()]
          .map(
            ([code, { count, tickers }]) =>
              `${code}×${count} (${tickers.join(", ")})`,
          )
          .join(", ");
        status += `\nUnrecognized trans codes skipped: ${codeSummary}`;
      }
      if (errors.length > 0)
        status += `\n\nRow errors (${errors.length}):\n${errors.join("\n")}`;
      setImportStatus(status);
      onClearMessage?.();
      onStocksChange(stocksData);
      onSummariesChange(summaryData);
      onTransactionCacheChange({});
    } catch (err) {
      setImportStatus(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    setImporting(false);
  };

  return (
    <div style={styles.pageContainer}>
      {/* Top navbar */}
      <div style={styles.navbar}>
        <h1 style={styles.logo}>PortfolioDashboard</h1>
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="btn btn-secondary"
            style={styles.hamburgerBtn}
            aria-label="Menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          {menuOpen && (
            <div style={styles.dropdownMenu}>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateToDashboard();
                }}
                style={styles.dropdownItem}
                className="dropdown-item"
              >
                <BarChart3 size={16} />
                Open Dashboard
              </button>
              {portfolioLoaded && tableRows.length > 0 && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleRefresh();
                  }}
                  disabled={refreshing}
                  style={styles.dropdownItem}
                  className="dropdown-item"
                >
                  <RefreshCw
                    size={16}
                    style={refreshing ? styles.spinningIcon : undefined}
                  />
                  {refreshing ? "Refreshing…" : "Refresh Prices"}
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (stocks.length > 0) {
                    setShowImportOptions(true);
                  } else {
                    csvInputRef.current?.click();
                  }
                }}
                disabled={importing}
                style={styles.dropdownItem}
                className="dropdown-item"
              >
                <Upload size={16} />
                {importing ? "Importing…" : "Import CSV"}
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
                style={{ ...styles.dropdownItem, ...styles.dropdownItemDanger }}
                className="dropdown-item"
              >
                <Trash2 size={16} />
                Delete All Data
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) handleImportFile(f);
        }}
        style={styles.hiddenFileInput}
      />

      {/* Import options modal */}
      {showImportOptions && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <p style={styles.modalText}>
              Clear existing data before importing?
            </p>
            <div style={styles.modalButtons}>
              <button
                onClick={async () => {
                  setShowImportOptions(false);
                  setDeleting(true);
                  try {
                    const res = await fetch(`${API_BASE}/api/all`, {
                      method: "DELETE",
                    });
                    if (!res.ok) throw new Error(`Server error: ${res.status}`);
                    onSummariesChange({});
                    onStocksChange([]);
                  } catch (err) {
                    setImportStatus(
                      `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
                    );
                    setDeleting(false);
                    return;
                  }
                  setDeleting(false);
                  csvInputRef.current?.click();
                }}
                disabled={deleting}
                className="btn btn-primary"
                style={styles.destructiveConfirmButton}
              >
                {deleting ? "Clearing…" : "Yes, clear first"}
              </button>
              <button
                onClick={() => {
                  setShowImportOptions(false);
                  csvInputRef.current?.click();
                }}
                disabled={deleting}
                className="btn btn-secondary"
                style={styles.cancelButton}
              >
                No, keep existing
              </button>
              <button
                onClick={() => setShowImportOptions(false)}
                disabled={deleting}
                className="btn btn-secondary"
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <p style={styles.modalText}>Delete all stocks and transactions?</p>
            <div style={styles.modalButtons}>
              <button
                onClick={handleDeleteAll}
                disabled={deleting}
                className="btn btn-primary"
                style={styles.destructiveConfirmButton}
              >
                {deleting ? "Deleting…" : "Yes, delete everything"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="btn btn-secondary"
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={styles.contentArea}>
        {message && <div style={styles.warningBanner}>{message}</div>}

        {(!portfolioLoaded || importing) && (
          <div style={styles.loadingContainer}>
            <div className="spinner" />
            <span style={styles.loadingStatusText}>
              {importing ? "Importing transactions…" : "Rating portfolio…"}
            </span>
            {importing && importLog && (
              <span style={styles.importProgressLog}>{importLog}</span>
            )}
          </div>
        )}

        {portfolioLoaded &&
          !importing &&
          Object.values(summaries).some((s) => s.totalShares > 0) && (
            <>
              {/* <h2 style={styles.sectionHeading}>Portfolio Summary</h2> */}
              <PortfolioCharts summaries={summaries} />
            </>
          )}

        {portfolioLoaded &&
          !importing &&
          Object.values(summaries).some((s) => s.totalShares > 0) && (
            <PortfolioTable
              tableRows={tableRows}
              sortKey={sortKey}
              onSort={handleSort}
              onNavigateToDashboard={onNavigateToDashboard}
              filterStatus={filterStatus}
              onFilterStatusChange={onFilterStatusChange}
              filterValue={filterValue}
              onFilterValueChange={onFilterValueChange}
              filterDividends={filterDividends}
              onFilterDividendsChange={onFilterDividendsChange}
              totalStockCount={Object.keys(summaries).length}
              portfolioLoaded={portfolioLoaded}
            />
          )}

        {importStatus && (
          <div style={styles.importStatusBox}>{importStatus}</div>
        )}
      </div>

      <footer style={styles.footer}>
        <span style={styles.footerLabel}>Built With</span>
        <div style={styles.techStackRow}>
          {TECH_STACK.map((tech) => (
            <span key={tech} style={styles.techStackChip}>
              {tech}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
