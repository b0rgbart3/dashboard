import React, { useState, useEffect, useMemo, useRef } from "react";
import Ticker from "./components/Ticker";
import TransactionForm from "./components/TransactionForm";
import HistoryTable from "./components/HistoryTable";
import ProjectionView from "./components/ProjectionView";
import StockNavigator from "./components/StockNavigator";
import AddStockModal from "./components/AddStockModal";
import FilterBar from "./components/FilterBar";
import PriceChart from "./components/PriceChart";
import {
  Plus,
  History,
  BarChart3,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const PRICE_TTL = 5 * 60 * 1000; // 5 minutes
import {
  AreaChart,
  Area,
  Bar,
  ComposedChart,
  Line,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parse, startOfMonth } from "date-fns";
import {
  matchesValueFilter,
  type Transaction,
  type Stock,
  type StockSummary,
  type FilterValue,
  type ProjectionSettings,
} from "./types";

interface HistoricalDataPoint {
  timestamp: number; // Unix ms — numeric XAxis dataKey
  displayDate: string; // "Mar 17, 2026" — for tooltip label
  value: number;
  cost: number;
  qty: number;
  dividendValue: number;
  lastDividendAmount: number | null; // most recent single dividend payment; null before first dividend
}

interface DashboardProps {
  onBack: (message?: string) => void;
  initialTicker?: string;
  filterStatus: "all" | "active" | "inactive";
  onFilterStatusChange: (v: "all" | "active" | "inactive") => void;
  filterValue: FilterValue;
  onFilterValueChange: (v: FilterValue) => void;
  filterDividends: "all" | "yes" | "no";
  onFilterDividendsChange: (v: "all" | "yes" | "no") => void;
  stocks: Stock[];
  onStocksChange: React.Dispatch<React.SetStateAction<Stock[]>>;
  summaries: Record<string, StockSummary>;
  portfolioLoaded: boolean;
  lookedUpTickers: React.RefObject<Set<string>>;
  transactionCache: Record<string, Transaction[]>;
  onTransactionCacheChange: React.Dispatch<
    React.SetStateAction<Record<string, Transaction[]>>
  >;
  priceCache: Record<string, { price: number; fetchedAt: number }>;
  onPriceCacheChange: React.Dispatch<
    React.SetStateAction<Record<string, { price: number; fetchedAt: number }>>
  >;
  projectionSettingsCache: Record<string, ProjectionSettings>;
  onProjectionSettingsCacheChange: React.Dispatch<
    React.SetStateAction<Record<string, ProjectionSettings>>
  >;
}

const Dashboard = ({
  onBack,
  initialTicker,
  filterStatus,
  onFilterStatusChange,
  filterValue,
  onFilterValueChange,
  filterDividends,
  onFilterDividendsChange,
  stocks,
  onStocksChange,
  summaries,
  portfolioLoaded,
  lookedUpTickers,
  transactionCache,
  onTransactionCacheChange,
  priceCache,
  onPriceCacheChange,
  projectionSettingsCache,
  onProjectionSettingsCacheChange,
}: DashboardProps) => {
  const [currentStockIndex, setCurrentStockIndex] = useState<number>(0);
  const navigatedViaHash = useRef(false);
  const [showAddStockModal, setShowAddStockModal] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);

  const purchases = transactions.filter(
    (t) => t.type === "purchase" || t.type === "BUY",
  );
  const sells = transactions.filter((t) => t.type === "SELL");
  const slipTransactions = transactions.filter((t) => t.type === "SLIP");
  const dividendTransactions = transactions.filter(
    (t) =>
      t.type === "dividend" ||
      t.type === "MDIV" ||
      t.type === "CDIV" ||
      t.type === "RETURN_OF_CAPITAL",
  );
  const dtaxTransactions = transactions.filter((t) => t.type === "DTAX");

  const totalShares = useMemo(() => {
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    let qty = 0;
    for (const t of sorted) {
      if (
        t.type === "BUY" ||
        t.type === "purchase" ||
        t.type === "REC" ||
        t.type === "SHARE_EXCHANGE" ||
        t.type === "MRGS_MERGER" ||
        t.type === "SPINOFF"
      )
        qty += t.quantity;
      else if (t.type === "SELL" || t.type === "SHARE_EXCHANGE_OUT")
        qty -= t.quantity;
      else if (t.type === "SPLIT") qty *= t.quantity;
    }
    return qty < 0.0001 ? 0 : qty;
  }, [transactions]);
  const lastPurchasePrice =
    purchases.length > 0 ? purchases[purchases.length - 1].price : 0;
  const currentPrice = livePrice ?? lastPurchasePrice;
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [priceChartOpen, setPriceChartOpen] = useState<boolean>(true);
  const [transactionsOpen, setTransactionsOpen] = useState<boolean>(false);
  const [accumulationOpen, setAccumulationOpen] = useState<boolean>(false);
  const [annualGrowthOpen, setAnnualGrowthOpen] = useState<boolean>(false);
  const [costBasisOpen, setCostBasisOpen] = useState<boolean>(false);
  const [chartMounted, setChartMounted] = useState(false);

  const currentStock = stocks[currentStockIndex] ?? null;
  const currentTicker = currentStock?.ticker ?? "";

  useEffect(() => {
    setChartMounted(true);
  }, []);

  useEffect(() => {
    if (!portfolioLoaded) return;
    if (stocks.length === 0) {
      onBack("No ticker data found. Please import data first.");
      return;
    }
    // Handle navigation from homepage — prefer explicit prop, fall back to hash
    const target = (
      initialTicker ?? window.location.hash.slice(1)
    ).toUpperCase();
    if (target) {
      const idx = stocks.findIndex(
        (s: Stock) => s.ticker.toUpperCase() === target,
      );
      if (idx !== -1) {
        setCurrentStockIndex(idx);
        navigatedViaHash.current = true;
      }
    }
    // Auto-update name (if still the ticker symbol) and description (if missing).
    // Guard with lookedUpTickers so this fires at most once per ticker per session,
    // regardless of how many times the Dashboard mounts.
    stocks
      .filter(
        (s) =>
          (s.name === s.ticker || !s.description) &&
          !lookedUpTickers.current?.has(s.ticker),
      )
      .forEach(async (stock) => {
        lookedUpTickers.current?.add(stock.ticker);
        try {
          const res = await fetch(
            `http://localhost:5001/api/lookup/${stock.ticker}`,
          );
          if (!res.ok) return;
          const { name, description } = (await res.json()) as {
            name: string;
            description?: string;
          };
          const updates: { name?: string; description?: string } = {};
          if (name && name !== stock.ticker && stock.name === stock.ticker)
            updates.name = name;
          if (description && !stock.description)
            updates.description = description;
          if (Object.keys(updates).length === 0) return;
          onStocksChange((prev: Stock[]) =>
            prev.map((s) =>
              s.ticker === stock.ticker ? { ...s, ...updates } : s,
            ),
          );
          fetch(`http://localhost:5001/api/stocks/${stock.ticker}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }).catch(() => {});
        } catch {
          /* ignore */
        }
      });
  }, [portfolioLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentTicker) {
      window.location.hash = currentTicker;
    }
  }, [currentTicker]);

  useEffect(() => {
    if (!currentTicker) return;
    const cached = transactionCache[currentTicker];
    if (cached) {
      setTransactions(cached);
      return;
    }
    setTransactions([]);
    let cancelled = false;
    fetch(`http://localhost:5001/api/transactions?ticker=${currentTicker}`)
      .then((res) => res.json())
      .then((data: Transaction[]) => {
        if (cancelled) return;
        setTransactions(data);
        onTransactionCacheChange((prev) => ({
          ...prev,
          [currentTicker]: data,
        }));
      })
      .catch((err) => {
        if (!cancelled) console.error("Error fetching transactions:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTicker]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentTicker) return;
    const cached = priceCache[currentTicker];
    if (cached && Date.now() - cached.fetchedAt < PRICE_TTL) {
      setLivePrice(cached.price);
      return;
    }
    setLivePrice(null);
    let cancelled = false;
    fetch(`http://localhost:5001/api/price/${currentTicker}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { price: number }) => {
        if (cancelled) return;
        setLivePrice(data.price);
        onPriceCacheChange((prev) => ({
          ...prev,
          [currentTicker]: { price: data.price, fetchedAt: Date.now() },
        }));
      })
      .catch((err) => {
        if (!cancelled)
          console.warn(`Live price unavailable for ${currentTicker}:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTicker]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTransaction = async (t: Omit<Transaction, "id">): Promise<void> => {
    try {
      const res = await fetch("http://localhost:5001/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...t, ticker: currentTicker, id: Date.now() }),
      });
      if (res.ok) {
        const saved: Transaction = await res.json();
        setTransactions((prev) => {
          const updated = [...prev, saved].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          onTransactionCacheChange((cache) => ({
            ...cache,
            [currentTicker]: updated,
          }));
          return updated;
        });
      }
    } catch (err) {
      console.error("Error saving transaction:", err);
    }
  };

  const importTransactions = async (
    entries: Omit<Transaction, "id">[],
  ): Promise<void> => {
    try {
      const tagged = entries.map((e, i) => ({
        ...e,
        ticker: currentTicker,
        id: Date.now() + i,
      }));
      const res = await fetch("http://localhost:5001/api/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tagged),
      });
      if (res.ok) {
        const {
          inserted: saved,
          skipped,
        }: { inserted: Transaction[]; skipped: number } = await res.json();
        setTransactions((prev) => {
          const updated = [...prev, ...saved].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          onTransactionCacheChange((cache) => ({
            ...cache,
            [currentTicker]: updated,
          }));
          return updated;
        });
        if (skipped > 0) {
          alert(
            `${skipped} duplicate transaction${skipped !== 1 ? "s were" : " was"} skipped (already exist in the database).`,
          );
        }
      }
    } catch (err) {
      console.error("Error importing transactions:", err);
    }
  };

  const deleteAllTransactions = async (): Promise<void> => {
    if (
      !confirm(
        `Delete all transaction history for ${currentTicker}? This cannot be undone.`,
      )
    )
      return;
    try {
      const res = await fetch(
        `http://localhost:5001/api/transactions?ticker=${currentTicker}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setTransactions([]);
        onTransactionCacheChange((cache) => ({
          ...cache,
          [currentTicker]: [],
        }));
      }
    } catch (err) {
      console.error("Error deleting all transactions:", err);
    }
  };

  const deleteEntry = async (id: number): Promise<void> => {
    try {
      const res = await fetch(`http://localhost:5001/api/transactions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setTransactions((prev) => {
          const updated = prev.filter((t) => t.id !== id);
          onTransactionCacheChange((cache) => ({
            ...cache,
            [currentTicker]: updated,
          }));
          return updated;
        });
      }
    } catch (err) {
      console.error("Error deleting entry:", err);
    }
  };

  const handleAddStock = async (
    name: string,
    ticker: string,
  ): Promise<void> => {
    try {
      const newStock: Stock = {
        id: ticker,
        ticker,
        name,
        createdAt: new Date().toISOString().split("T")[0],
      };
      const res = await fetch("http://localhost:5001/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStock),
      });
      if (res.ok) {
        const saved: Stock = await res.json();
        onStocksChange((prev: Stock[]) => {
          const updated = [...prev, saved];
          setCurrentStockIndex(updated.length - 1);
          return updated;
        });
        setShowAddStockModal(false);
      } else if (res.status === 409) {
        alert(`Stock ${ticker} already exists.`);
      }
    } catch (err) {
      console.error("Error adding stock:", err);
    }
  };

  const handleRemoveStock = async (): Promise<void> => {
    if (!currentStock) return;
    if (
      !confirm(
        `Permanently delete ${currentStock.name} (${currentTicker}) and all its data? This cannot be undone.`,
      )
    )
      return;
    try {
      const res = await fetch(
        `http://localhost:5001/api/stocks/${currentTicker}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        onStocksChange((prev: Stock[]) => {
          const updated = prev.filter((s) => s.ticker !== currentTicker);
          setCurrentStockIndex((i) =>
            Math.max(0, Math.min(i, updated.length - 1)),
          );
          return updated;
        });
        setTransactions([]);
        onTransactionCacheChange((cache) => {
          const next = { ...cache };
          delete next[currentTicker];
          return next;
        });
        onPriceCacheChange((cache) => {
          const next = { ...cache };
          delete next[currentTicker];
          return next;
        });
        onProjectionSettingsCacheChange((cache) => {
          const next = { ...cache };
          delete next[currentTicker];
          return next;
        });
      }
    } catch (err) {
      console.error("Error removing stock:", err);
    }
  };

  const filteredStocks = useMemo(() => {
    if (!portfolioLoaded) return stocks;
    return stocks
      .filter((s) => {
        const summary = summaries[s.ticker];
        const isActive = summary && summary.totalShares > 0;
        if (filterStatus === "active" && !isActive) return false;
        if (filterStatus === "inactive" && isActive) return false;
        if (!matchesValueFilter(summary?.marketValue ?? 0, filterValue))
          return false;
        if (filterDividends === "yes" && !summary?.hasDividends) return false;
        if (filterDividends === "no" && summary?.hasDividends) return false;
        return true;
      })
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [
    stocks,
    summaries,
    portfolioLoaded,
    filterStatus,
    filterValue,
    filterDividends,
  ]);

  const filteredIndex = filteredStocks.findIndex(
    (s) => s.ticker === currentTicker,
  );

  // If active filters push current stock out of view, jump to first visible stock.
  // Skip the reset once when the stock was set by hash navigation (homepage link).
  useEffect(() => {
    if (filteredStocks.length === 0) return;
    const ticker = stocks[currentStockIndex]?.ticker;
    if (!filteredStocks.some((s) => s.ticker === ticker)) {
      if (navigatedViaHash.current) {
        navigatedViaHash.current = false;
        return;
      }
      setCurrentStockIndex(
        stocks.findIndex((s) => s.ticker === filteredStocks[0].ticker),
      );
    }
  }, [filteredStocks]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToPrev = () => {
    const idx = Math.max(0, filteredIndex - 1);
    const stock = filteredStocks[idx];
    if (stock)
      setCurrentStockIndex(stocks.findIndex((s) => s.ticker === stock.ticker));
  };
  const goToNext = () => {
    const idx = Math.min(filteredStocks.length - 1, filteredIndex + 1);
    const stock = filteredStocks[idx];
    if (stock)
      setCurrentStockIndex(stocks.findIndex((s) => s.ticker === stock.ticker));
  };
  const handleNavigate = (filteredIdx: number) => {
    const stock = filteredStocks[filteredIdx];
    if (stock)
      setCurrentStockIndex(stocks.findIndex((s) => s.ticker === stock.ticker));
  };

  const getHistoricalData = (): HistoricalDataPoint[] => {
    // Independent dividend payment history: date → total paid that day.
    // Completely separate from all other calculations.
    const dividendByDay = new Map<string, number>();
    for (const t of transactions) {
      if (
        t.type === "dividend" ||
        t.type === "MDIV" ||
        t.type === "CDIV" ||
        t.type === "RETURN_OF_CAPITAL"
      ) {
        dividendByDay.set(
          t.date,
          (dividendByDay.get(t.date) ?? 0) + t.price * t.quantity,
        );
      }
    }

    const dayMap = new Map<
      string,
      {
        qty: number;
        cost: number;
        lastPrice: number;
        dividendCost: number;
        splitRatio?: number;
      }
    >();

    const sorted = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    for (const t of sorted) {
      const dayKey = t.date;
      const existing = dayMap.get(dayKey);
      const isBuy =
        t.type === "BUY" || t.type === "purchase" || t.type === "REC";
      const isSell = t.type === "SELL";
      const isCashIncome =
        t.type === "dividend" ||
        t.type === "MDIV" ||
        t.type === "CDIV" ||
        t.type === "RETURN_OF_CAPITAL";
      const isSplit = t.type === "SPLIT";
      const qtyDelta = isBuy ? t.quantity : isSell ? -t.quantity : 0;
      if (existing) {
        existing.qty += qtyDelta;
        if (isCashIncome) existing.dividendCost += t.price * t.quantity;
        if (isBuy) {
          existing.cost += t.price * t.quantity;
          existing.lastPrice = t.price;
        } else if (isSplit) {
          existing.splitRatio = (existing.splitRatio ?? 1) * t.quantity;
        }
      } else {
        dayMap.set(dayKey, {
          qty: qtyDelta,
          cost: isBuy ? t.price * t.quantity : 0,
          lastPrice: isBuy ? t.price : 0,
          dividendCost: isCashIncome ? t.price * t.quantity : 0,
          splitRatio: isSplit ? t.quantity : undefined,
        });
      }
    }

    const sortedDayKeys = [...dayMap.keys()].sort();

    let runningQty = 0;
    let runningCost = 0;
    let runningDividendValue = 0;
    let lastKnownPrice = 0;
    let lastDividendAmount: number | null = null;
    const result: HistoricalDataPoint[] = [];

    for (const dayKey of sortedDayKeys) {
      const data = dayMap.get(dayKey)!;
      runningQty += data.qty;
      runningCost += data.cost;
      runningDividendValue += data.dividendCost;
      if (data.splitRatio) {
        runningQty *= data.splitRatio;
        if (lastKnownPrice > 0) lastKnownPrice /= data.splitRatio;
      }
      if (data.lastPrice > 0) lastKnownPrice = data.lastPrice;
      // Last dividend: read directly from the independent dividend history map
      const divPaidToday = dividendByDay.get(dayKey);
      if (divPaidToday) lastDividendAmount = +divPaidToday.toFixed(2);
      const parsedDate = parse(dayKey, "yyyy-MM-dd", new Date());
      result.push({
        timestamp: parsedDate.getTime(),
        displayDate: format(parsedDate, "MMM d, yyyy"),
        value: +(runningQty * lastKnownPrice).toFixed(2),
        cost: +runningCost.toFixed(2),
        qty: runningQty,
        dividendValue: +runningDividendValue.toFixed(2),
        lastDividendAmount,
      });
    }

    return result;
  };

  const getAnnualGrowthData = () => {
    if (historicalData.length === 0) return { data: [], useMonths: false };
    const firstDate = new Date(historicalData[0].timestamp);
    const lastDate = new Date(
      historicalData[historicalData.length - 1].timestamp,
    );
    const useMonths =
      lastDate.getTime() - firstDate.getTime() < 365.25 * 24 * 60 * 60 * 1000;
    const bucketMap = new Map<string, HistoricalDataPoint>();
    for (const point of historicalData) {
      const date = new Date(point.timestamp);
      const key = useMonths ? format(date, "yyyy-MM") : format(date, "yyyy");
      bucketMap.set(key, point);
    }
    const sorted = [...bucketMap.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const data = sorted.map(([key, point], i) => {
      const prevValue = i > 0 ? sorted[i - 1][1].value : null;
      const deltaValue =
        prevValue !== null ? +(point.value - prevValue).toFixed(2) : null;
      return {
        label: useMonths
          ? format(parse(key, "yyyy-MM", new Date()), "MMM yyyy")
          : key,
        gainPct:
          point.cost > 0
            ? +(((point.value - point.cost) / point.cost) * 100).toFixed(2)
            : 0,
        value: point.value,
        cost: point.cost,
        deltaValue,
      };
    });
    return { data, useMonths };
  };

  const toggleSort = () => {
    setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
  };

  const combinedEntries: Transaction[] = [...transactions].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    const diff = dateB.getTime() - dateA.getTime();
    if (diff !== 0) return sortOrder === "desc" ? diff : -diff;
    return sortOrder === "desc" ? b.id - a.id : a.id - b.id;
  });

  const historicalData = getHistoricalData();
  const lastDividendPayment =
    historicalData.length > 0
      ? historicalData[historicalData.length - 1].lastDividendAmount
      : null;
  const { data: annualGrowthData, useMonths: growthUseMonths } =
    getAnnualGrowthData();

  const splitMarkers = transactions
    .filter((t) => t.type === "SPLIT")
    .map((t) => ({
      timestamp: parse(t.date, "yyyy-MM-dd", new Date()).getTime(),
      ratio: t.quantity,
      label:
        t.quantity >= 1
          ? `${+t.quantity.toFixed(4).replace(/\.?0+$/, "")}:1 Split`
          : `1:${+(1 / t.quantity).toFixed(4).replace(/\.?0+$/, "")} Rev`,
    }));
  const avgGrowthPct =
    annualGrowthData.length > 0
      ? +(
          annualGrowthData.reduce((sum, d) => sum + d.gainPct, 0) /
          annualGrowthData.length
        ).toFixed(2)
      : null;

  const costBasisChartData = useMemo(() => {
    const cb = summaries[currentTicker]?.costBasis;
    if (!cb || Object.keys(cb.monthly).length === 0)
      return { data: [], total: 0 };
    const monthKeys = Object.keys(cb.monthly).sort();
    return {
      data: monthKeys.map((key) => ({
        label: format(parse(key, "yyyy-MM", new Date()), "MMM yyyy"),
        avgCost: cb.monthly[key],
      })),
      total: cb.total,
    };
  }, [summaries, currentTicker]);

  const maxDividendValue = Math.max(
    0,
    ...historicalData.map((d) => d.dividendValue),
  );
  const hasDividendData = maxDividendValue > 0;
  const dividendAxisMax = (() => {
    if (maxDividendValue <= 0) return 10;
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxDividendValue)));
    const normalized = maxDividendValue / magnitude;
    const niceFactor =
      normalized <= 1
        ? 1
        : normalized <= 1.5
          ? 1.5
          : normalized <= 2
            ? 2
            : normalized <= 5
              ? 5
              : 10;
    return niceFactor * magnitude;
  })();

  const monthTicks: number[] = (() => {
    const seen = new Set<number>();
    const ticks: number[] = [];
    for (const point of historicalData) {
      const monthStart = startOfMonth(new Date(point.timestamp)).getTime();
      if (!seen.has(monthStart)) {
        seen.add(monthStart);
        ticks.push(point.timestamp);
      }
    }
    return ticks;
  })();

  if (!portfolioLoaded) {
    return (
      <div
        className="dashboard-container flex items-center justify-center"
        style={{ minHeight: "60vh" }}
      >
        <div className="text-text-secondary italic">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <StockNavigator
        stocks={filteredStocks}
        currentIndex={Math.max(0, filteredIndex)}
        onPrev={goToPrev}
        onNext={goToNext}
        onNavigate={handleNavigate}
        onAddStock={() => setShowAddStockModal(true)}
        onRemoveStock={handleRemoveStock}
        onBack={() => onBack()}
      />

      {/* Filter bar */}
      <FilterBar
        filterStatus={filterStatus}
        onStatusChange={onFilterStatusChange}
        filterValue={filterValue}
        onValueChange={onFilterValueChange}
        filterDividends={filterDividends}
        onDividendsChange={onFilterDividendsChange}
        filteredCount={filteredStocks.length}
        totalCount={stocks.length}
        summariesLoaded={portfolioLoaded}
      />

      <header className="mb-8 mt-4">
        <Ticker
          symbol={currentTicker}
          name={currentStock?.name}
          description={currentStock?.description}
          price={currentPrice}
          isLive={livePrice !== null}
          totalShares={totalShares}
          marketValue={totalShares * currentPrice}
          totalInvested={
            summaries[currentTicker]?.totalInvested ??
            purchases.reduce((sum, p) => sum + p.quantity * p.price, 0)
          }
          sellProceeds={sells.reduce((sum, s) => sum + s.quantity * s.price, 0)}
          realizedPnL={summaries[currentTicker]?.realizedPnL}
          cashIncome={slipTransactions.reduce(
            (sum, t) => sum + t.quantity * t.price,
            0,
          )}
          dividendIncome={dividendTransactions.reduce(
            (sum, t) => sum + t.quantity * t.price,
            0,
          )}
          lastDividendPayment={lastDividendPayment}
          withheldTax={dtaxTransactions.reduce(
            (sum, t) => sum + t.quantity * t.price,
            0,
          )}
          avgPurchasePrice={
            totalShares > 0
              ? (summaries[currentTicker]?.costBasis?.total ?? null)
              : null
          }
          earliestPurchaseDate={
            purchases.length > 0
              ? purchases.reduce(
                  (earliest, p) => (p.date < earliest ? p.date : earliest),
                  purchases[0].date,
                )
              : null
          }
          activeInvestmentYears={
            purchases.length > 0
              ? new Set(purchases.map((p) => new Date(p.date).getFullYear()))
                  .size
              : null
          }
          closedDate={summaries[currentTicker]?.closedDate ?? null}
          rating={summaries[currentTicker]?.rating ?? null}
          absoluteRating={summaries[currentTicker]?.absoluteRating ?? null}
          stockType={summaries[currentTicker]?.stockType ?? null}
        />
      </header>

      {showAddStockModal && (
        <AddStockModal
          onAdd={handleAddStock}
          onClose={() => setShowAddStockModal(false)}
        />
      )}

      <div className="dashboard-scroll-area">
        <main className="grid gap-4">
          <section
            className="glass-card"
            style={{ paddingBottom: priceChartOpen ? undefined : 0 }}
          >
            <div
              className="accordion-header"
              style={{ marginBottom: priceChartOpen ? undefined : 0 }}
              onClick={() => setPriceChartOpen((prev) => !prev)}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <TrendingUp className="text-accent-blue" size={24} />
                <h2>Price Chart</h2>
              </div>
              {priceChartOpen ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </div>
            {priceChartOpen && <PriceChart ticker={currentTicker} />}
          </section>

          <section
            className="glass-card"
            style={{ paddingBottom: transactionsOpen ? undefined : 0 }}
          >
            <div
              className="accordion-header"
              style={{ marginBottom: transactionsOpen ? undefined : 0 }}
              onClick={() => setTransactionsOpen((prev) => !prev)}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Plus className="text-accent-purple" size={24} />
                <h2>Add Transactions</h2>
              </div>
              {transactionsOpen ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </div>
            {transactionsOpen && (
              <TransactionForm
                onAdd={addTransaction}
                onImport={importTransactions}
              />
            )}
          </section>

          <section
            className="glass-card"
            style={{ paddingBottom: historyOpen ? undefined : 0 }}
          >
            <div
              className="accordion-header"
              style={{ marginBottom: historyOpen ? undefined : 0 }}
              onClick={() => setHistoryOpen((prev) => !prev)}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <History className="text-accent-blue" size={24} />
                <h2>Transaction History</h2>
              </div>
              <div className="flex items-center gap-2">
                {historyOpen ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </div>
            </div>
            {historyOpen && (
              <HistoryTable
                purchases={combinedEntries}
                onSortToggle={toggleSort}
                sortOrder={sortOrder}
                onDelete={deleteEntry}
                onDeleteAll={
                  transactions.length > 0 ? deleteAllTransactions : undefined
                }
              />
            )}
          </section>

          <section
            className="glass-card"
            style={{ paddingBottom: accumulationOpen ? undefined : 0 }}
          >
            <div
              className="accordion-header"
              style={{
                position: "relative",
                marginBottom: accumulationOpen ? undefined : 0,
              }}
              onClick={() => setAccumulationOpen((prev) => !prev)}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <BarChart3 className="text-accent-green" size={24} />
                <h2>Accumulation Graph</h2>
              </div>
              {accumulationOpen ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </div>
            {accumulationOpen && (
              <div
                style={{
                  position: "relative",
                  height: "300px",
                  width: "100%",
                  minWidth: 0,
                }}
              >
                <div
                  className="flex items-center gap-4"
                  style={{
                    position: "absolute",
                    top: "8px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 1,
                    pointerEvents: "none",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      style={{
                        width: "24px",
                        height: "0",
                        borderTop: "2px dashed var(--brand-primary)",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      Current Value
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      style={{
                        width: "24px",
                        height: "3px",
                        background: "var(--brand-accent)",
                        borderRadius: "2px",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      Total Spent
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      style={{
                        width: "24px",
                        height: "3px",
                        background: "var(--data-minor)",
                        borderRadius: "2px",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      Share Count
                    </span>
                  </div>
                  {hasDividendData && (
                    <>
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            width: "24px",
                            height: "3px",
                            background: "var(--success)",
                            borderRadius: "2px",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--text-muted)",
                          }}
                        >
                          Dividends Received
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            width: "24px",
                            height: "0",
                            borderTop: "2px dashed var(--warning)",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--text-muted)",
                          }}
                        >
                          Last Dividend
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {historicalData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-text-secondary italic">
                    Add a purchase to see historical data.
                  </div>
                ) : chartMounted ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={historicalData}>
                      <defs>
                        <linearGradient
                          id="colorCost"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="var(--brand-accent)"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--brand-accent)"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="timestamp"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        ticks={monthTicks}
                        tickFormatter={(ts: number) =>
                          format(new Date(ts), "MMM yyyy")
                        }
                        stroke="var(--text-muted)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        yAxisId="left"
                        stroke="var(--text-muted)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          `$${Number(value).toLocaleString()}`
                        }
                      />
                      {hasDividendData && (
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="var(--warning)"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, dividendAxisMax]}
                          tickFormatter={(value) => `$${value}`}
                        />
                      )}
                      <YAxis
                        yAxisId="shares"
                        orientation="right"
                        stroke="var(--data-minor)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        hide={hasDividendData}
                        tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border)",
                          borderRadius: "8px",
                        }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const point = historicalData.find(
                            (d) => d.timestamp === label,
                          );
                          const displayDate = point
                            ? point.displayDate
                            : format(new Date(label as number), "MMM d, yyyy");
                          const colorMap: Record<string, string> = {
                            "Total Spent": "var(--brand-accent)",
                            "Current Value": "var(--brand-primary)",
                            "Dividends Received": "var(--success)",
                            "Last Dividend": "var(--warning)",
                            "Share Count": "var(--data-minor)",
                          };
                          const order = hasDividendData
                            ? [
                                "Current Value",
                                "Total Spent",
                                "Dividends Received",
                                "Last Dividend",
                                "Share Count",
                              ]
                            : ["Current Value", "Total Spent", "Share Count"];
                          const filteredPayload = hasDividendData
                            ? payload
                            : payload.filter(
                                (e) =>
                                  e.name !== "Dividends Received" &&
                                  e.name !== "Last Dividend",
                              );
                          return (
                            <div
                              style={{
                                backgroundColor: "var(--bg-card)",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "10px 14px",
                              }}
                            >
                              <p
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: "12px",
                                  marginBottom: "8px",
                                }}
                              >
                                {displayDate}
                              </p>
                              {[...filteredPayload]
                                .sort((a, b) => {
                                  return (
                                    order.indexOf(a.name as string) -
                                    order.indexOf(b.name as string)
                                  );
                                })
                                .map((entry) => (
                                  <div
                                    key={entry.name}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: "10px",
                                        height: "10px",
                                        borderRadius: "2px",
                                        background:
                                          colorMap[entry.name as string] ??
                                          entry.color,
                                        flexShrink: 0,
                                      }}
                                    />
                                    <span
                                      style={{
                                        color: "var(--text-muted)",
                                        fontSize: "13px",
                                      }}
                                    >
                                      {entry.name}:
                                    </span>
                                    <span
                                      style={{
                                        color: "var(--text)",
                                        fontSize: "13px",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {entry.name === "Share Count"
                                        ? (entry.value as number).toLocaleString(
                                            "en-US",
                                            {
                                              minimumFractionDigits: 0,
                                              maximumFractionDigits: 4,
                                            },
                                          )
                                        : `$${(entry.value as number).toLocaleString(
                                            "en-US",
                                            {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            },
                                          )}`}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          );
                        }}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="cost"
                        stroke="var(--brand-accent)"
                        fillOpacity={1}
                        fill="url(#colorCost)"
                        strokeWidth={3}
                        name="Total Spent"
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="value"
                        stroke="var(--brand-primary)"
                        fill="transparent"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Current Value"
                      />
                      {hasDividendData && (
                        <>
                          <Area
                            yAxisId="right"
                            type="monotone"
                            dataKey="dividendValue"
                            stroke="var(--success)"
                            fill="transparent"
                            strokeWidth={2}
                            name="Dividends Received"
                          />
                          <Area
                            yAxisId="right"
                            type="stepAfter"
                            dataKey="lastDividendAmount"
                            stroke="var(--warning)"
                            fill="transparent"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            name="Last Dividend"
                            connectNulls={false}
                          />
                        </>
                      )}
                      <Area
                        yAxisId="shares"
                        type="stepAfter"
                        dataKey="qty"
                        stroke="var(--data-minor)"
                        fill="transparent"
                        strokeWidth={2}
                        name="Share Count"
                      />
                      {splitMarkers.map((marker) => (
                        <ReferenceLine
                          key={marker.timestamp}
                          yAxisId="left"
                          x={marker.timestamp}
                          stroke="var(--chart-8)"
                          strokeDasharray="4 4"
                          label={{
                            value: marker.label,
                            position: "insideTopRight",
                            fontSize: 10,
                            fill: "var(--chart-8)",
                          }}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            )}
          </section>

          <section
            className="glass-card"
            style={{ paddingBottom: annualGrowthOpen ? undefined : 0 }}
          >
            <div
              className="accordion-header"
              style={{
                position: "relative",
                marginBottom: annualGrowthOpen ? undefined : 0,
              }}
              onClick={() => setAnnualGrowthOpen((prev) => !prev)}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <BarChart3 className="text-accent-purple" size={24} />
                <h2>Annual Growth</h2>
              </div>
              {annualGrowthOpen && avgGrowthPct !== null && (
                <div
                  className="flex items-center gap-2"
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                  }}
                >
                  <div
                    style={{
                      width: "24px",
                      height: "0",
                      borderTop: "2px dashed var(--warning)",
                    }}
                  />
                  <span
                    style={{ fontSize: "12px", color: "var(--text-muted)" }}
                  >
                    Avg: {avgGrowthPct >= 0 ? "+" : ""}
                    {avgGrowthPct}%
                  </span>
                </div>
              )}
              {annualGrowthOpen ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </div>
            {annualGrowthOpen && (
              <div style={{ height: "300px", width: "100%", minWidth: 0 }}>
                {annualGrowthData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-text-secondary italic">
                    Add a purchase to see growth data.
                  </div>
                ) : chartMounted ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart
                      data={annualGrowthData}
                      margin={{ top: 8, right: 56, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="var(--text-muted)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        label={
                          growthUseMonths
                            ? undefined
                            : {
                                value: "Year",
                                position: "insideBottom",
                                offset: -4,
                                fill: "var(--text-muted)",
                                fontSize: 12,
                              }
                        }
                      />
                      <YAxis
                        yAxisId="left"
                        stroke="var(--text-muted)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="var(--chart-1)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          const abs = Math.abs(v);
                          if (abs >= 1000)
                            return `${v < 0 ? "-" : ""}$${(abs / 1000).toFixed(1)}k`;
                          return `${v < 0 ? "-" : ""}$${abs.toFixed(0)}`;
                        }}
                      />
                      <ReferenceLine
                        yAxisId="left"
                        y={0}
                        stroke="var(--text-muted)"
                        strokeOpacity={0.4}
                      />
                      {avgGrowthPct !== null && (
                        <ReferenceLine
                          yAxisId="left"
                          y={avgGrowthPct}
                          stroke="var(--warning)"
                          strokeDasharray="5 5"
                          strokeWidth={2}
                        />
                      )}
                      <Tooltip
                        cursor={{ fill: "var(--chart-cursor)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as {
                            label: string;
                            gainPct: number;
                            value: number;
                            cost: number;
                            deltaValue: number | null;
                          };
                          const gain = d.value - d.cost;
                          const rows: {
                            label: string;
                            value: string;
                            color: string;
                          }[] = [
                            {
                              label: "Current Value",
                              value: `$${d.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                              color: "var(--brand-primary)",
                            },
                            {
                              label: "Total Invested",
                              value: `$${d.cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                              color: "var(--brand-accent)",
                            },
                            {
                              label: "Gain / Loss",
                              value: `${gain >= 0 ? "+" : ""}$${gain.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                              color:
                                gain >= 0
                                  ? "var(--success)"
                                  : "var(--brand-primary)",
                            },
                            {
                              label: "Gain %",
                              value: `${d.gainPct >= 0 ? "+" : ""}${d.gainPct}%`,
                              color:
                                d.gainPct >= 0
                                  ? "var(--success)"
                                  : "var(--brand-primary)",
                            },
                          ];
                          if (d.deltaValue !== null) {
                            rows.push({
                              label: `${growthUseMonths ? "MoM" : "YoY"} Change`,
                              value: `${d.deltaValue >= 0 ? "+" : ""}$${d.deltaValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                              color: d.deltaValue >= 0 ? "var(--chart-1)" : "var(--chart-5)",
                            });
                          }
                          return (
                            <div
                              style={{
                                backgroundColor: "var(--bg-card)",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "10px 14px",
                              }}
                            >
                              <p
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: "12px",
                                  marginBottom: "8px",
                                }}
                              >
                                {d.label}
                              </p>
                              {rows.map((row) => (
                                <div
                                  key={row.label}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    marginBottom: "4px",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "10px",
                                      height: "10px",
                                      borderRadius: "2px",
                                      background: row.color,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <span
                                    style={{
                                      color: "var(--text-muted)",
                                      fontSize: "13px",
                                    }}
                                  >
                                    {row.label}:
                                  </span>
                                  <span
                                    style={{
                                      color: "var(--text)",
                                      fontSize: "13px",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {row.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => (
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "11px",
                            }}
                          >
                            {value === "gainPct"
                              ? "Gain %"
                              : `${growthUseMonths ? "MoM" : "YoY"} $ Change`}
                          </span>
                        )}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="gainPct"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={64}
                        name="gainPct"
                      >
                        {annualGrowthData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={
                              entry.gainPct >= 0
                                ? "var(--success)"
                                : "var(--chart-8)"
                            }
                            fillOpacity={0.85}
                          />
                        ))}
                      </Bar>
                      <Line
                        yAxisId="right"
                        dataKey="deltaValue"
                        name={`${growthUseMonths ? "MoM" : "YoY"} $ Change`}
                        type="monotone"
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        dot={{ fill: "var(--chart-1)", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            )}
          </section>

          <section
            className="glass-card"
            style={{ paddingBottom: costBasisOpen ? undefined : 0 }}
          >
            <div
              className="accordion-header"
              style={{
                position: "relative",
                marginBottom: costBasisOpen ? undefined : 0,
              }}
              onClick={() => setCostBasisOpen((prev) => !prev)}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <TrendingDown
                  size={24}
                  style={{ color: "var(--warning)" }}
                />
                <h2>Cost Basis</h2>
              </div>
              {costBasisOpen && costBasisChartData.total > 0 && (
                <div
                  className="flex items-center gap-2"
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                  }}
                >
                  <div
                    style={{
                      width: "24px",
                      height: "0",
                      borderTop: "2px dashed var(--warning)",
                    }}
                  />
                  <span
                    style={{ fontSize: "12px", color: "var(--text-muted)" }}
                  >
                    Current avg: $
                    {costBasisChartData.total.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {costBasisOpen ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </div>
            {costBasisOpen && (
              <div style={{ height: "300px", width: "100%", minWidth: 0 }}>
                {costBasisChartData.data.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-text-secondary italic">
                    Add a purchase to see cost basis data.
                  </div>
                ) : chartMounted ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart
                      data={costBasisChartData.data}
                      margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorCostBasis"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="var(--chart-4)"
                            stopOpacity={0.25}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--chart-4)"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="var(--text-muted)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="var(--text-muted)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          const abs = Math.abs(v);
                          if (abs >= 1000)
                            return `$${(abs / 1000).toFixed(1)}k`;
                          return `$${abs.toFixed(2)}`;
                        }}
                      />
                      {costBasisChartData.total > 0 && (
                        <ReferenceLine
                          y={costBasisChartData.total}
                          stroke="var(--warning)"
                          strokeDasharray="5 5"
                          strokeWidth={2}
                        />
                      )}
                      <Tooltip
                        cursor={{ fill: "var(--chart-cursor)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as {
                            label: string;
                            avgCost: number;
                          };
                          return (
                            <div
                              style={{
                                backgroundColor: "var(--bg-card)",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "10px 14px",
                              }}
                            >
                              <p
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: "12px",
                                  marginBottom: "8px",
                                }}
                              >
                                {d.label}
                              </p>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <div
                                  style={{
                                    width: "10px",
                                    height: "10px",
                                    borderRadius: "2px",
                                    background: "var(--warning)",
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    color: "var(--text-muted)",
                                    fontSize: "13px",
                                  }}
                                >
                                  Avg Cost / Share:
                                </span>
                                <span
                                  style={{
                                    color: "var(--text)",
                                    fontSize: "13px",
                                    fontWeight: 600,
                                  }}
                                >
                                  $
                                  {d.avgCost.toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="avgCost"
                        name="Avg Cost / Share"
                        stroke="var(--chart-4)"
                        strokeWidth={2}
                        fill="url(#colorCostBasis)"
                        dot={{ fill: "var(--chart-4)", r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            )}
          </section>

          <ProjectionView
            purchases={purchases}
            currentPrice={currentPrice}
            ticker={currentTicker}
            hasDividends={
              dividendTransactions.length > 0 || slipTransactions.length > 0
            }
            projectionSettingsCache={projectionSettingsCache}
            onProjectionSettingsCacheChange={onProjectionSettingsCacheChange}
          />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
