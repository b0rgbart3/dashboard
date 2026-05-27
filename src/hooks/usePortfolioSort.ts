import { useState, useMemo } from "react";
import { matchesValueFilter, type Stock, type StockSummary, type FilterValue } from "../types";
import { formatHeldDuration, type SortKey, type TableRow } from "../utils/portfolioUtils";

export function usePortfolioSort(
  summaries: Record<string, StockSummary>,
  stocks: Stock[],
  filterStatus: "all" | "active" | "inactive",
  filterValue: FilterValue,
  filterDividends: "all" | "yes" | "no"
): {
  tableRows: TableRow[];
  sortKey: SortKey;
  handleSort: (key: SortKey, defaultDir: "asc" | "desc") => void;
} {
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey, defaultDir: "asc" | "desc") => {
    if (key === sortKey) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(defaultDir);
    }
  };

  const tableRows = useMemo(() => {
    const rows = Object.entries(summaries)
      .filter(([, s]) => {
        const isActive = s.totalShares > 0;
        if (filterStatus === "inactive" && isActive) return false;
        if (filterStatus === "active" && !isActive) return false;
        if (!matchesValueFilter(s.marketValue, filterValue)) return false;
        if (filterDividends === "yes" && !s.hasDividends) return false;
        if (filterDividends === "no" && s.hasDividends) return false;
        return true;
      })
      .map(([ticker, s]) => ({
        ticker,
        name: (() => { const st = stocks.find(s => s.ticker === ticker); return st?.shortName ?? st?.name ?? ticker; })(),
        totalValue: s.marketValue,
        totalGain: s.totalReturn,
        totalInvested: s.totalInvested,
        totalShares: s.totalShares,
        dividends: s.dividendIncome,
        ytdDividends: s.ytdDividendIncome ?? 0,
        slipIncome: s.slipIncome,
        realizedPnL: s.realizedPnL,
        ytdRealizedPnL: s.ytdRealizedPnL ?? 0,
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
        heldMs: s.earliestPurchaseDate
          ? (s.closedDate ? new Date(s.closedDate + "T12:00:00").getTime() : Date.now()) - new Date(s.earliestPurchaseDate).getTime()
          : null,
        lengthHeld: formatHeldDuration(s.earliestPurchaseDate, s.closedDate),
        purchaseDate: s.earliestPurchaseDate,
        closedDate: s.closedDate ?? null,
        rating: s.rating,
        absoluteRating: s.absoluteRating,
        stockType: s.stockType,
      }));

    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
        case "name":   cmp = a.name.localeCompare(b.name); break;
        case "totalInvested": cmp = a.totalInvested - b.totalInvested; break;
        case "totalValue": cmp = a.totalValue - b.totalValue; break;
        case "totalGain":  cmp = a.totalGain - b.totalGain; break;
        case "gainPct":       cmp = a.gainPct - b.gainPct; break;
        case "annualGainPct": cmp = (a.annualGainPct ?? -Infinity) - (b.annualGainPct ?? -Infinity); break;
        case "totalShares":   cmp = a.totalShares - b.totalShares; break;
        case "dividends":     cmp = a.dividends - b.dividends; break;
        case "ytdDividends":  cmp = a.ytdDividends - b.ytdDividends; break;
        case "slipIncome":    cmp = a.slipIncome - b.slipIncome; break;
        case "realizedPnL":    cmp = a.realizedPnL - b.realizedPnL; break;
        case "ytdRealizedPnL": cmp = a.ytdRealizedPnL - b.ytdRealizedPnL; break;
        case "held": cmp = (a.heldMs ?? -Infinity) - (b.heldMs ?? -Infinity); break;
        case "rating": cmp = (a.rating ?? -1) - (b.rating ?? -1); break;
        case "absoluteRating": cmp = (a.absoluteRating ?? -1) - (b.absoluteRating ?? -1); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [summaries, stocks, sortKey, sortDir, filterStatus, filterValue, filterDividends]);

  return { tableRows, sortKey, handleSort };
}
