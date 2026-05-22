import { useState, useEffect, useMemo } from 'react';
import Ticker from './components/Ticker';
import TransactionForm from './components/TransactionForm';
import HistoryTable from './components/HistoryTable';
import ProjectionView from './components/ProjectionView';
import StockNavigator from './components/StockNavigator';
import AddStockModal from './components/AddStockModal';
import { Plus, History, BarChart3, ChevronDown, ChevronUp, Trash2, SlidersHorizontal } from 'lucide-react';
import { AreaChart, Area, Bar, ComposedChart, Line, Cell, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parse, startOfMonth } from 'date-fns';
import type { Transaction, Stock, StockSummary } from './types';

interface HistoricalDataPoint {
    timestamp: number;    // Unix ms — numeric XAxis dataKey
    displayDate: string;  // "Mar 17, 2026" — for tooltip label
    value: number;
    cost: number;
    qty: number;
    dividendValue: number;
    lastDividendAmount: number; // most recent single dividend payment up to this point
}

interface DashboardProps {
    onBack: (message?: string) => void;
}

const Dashboard = ({ onBack }: DashboardProps) => {
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [stocksLoaded, setStocksLoaded] = useState(false);
    const [currentStockIndex, setCurrentStockIndex] = useState<number>(0);
    const [stockSummaries, setStockSummaries] = useState<Record<string, StockSummary>>({});
    const [summariesLoaded, setSummariesLoaded] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');
    const [filterMinValue, setFilterMinValue] = useState<number>(1000);
    const [filterDividends, setFilterDividends] = useState<'all' | 'yes' | 'no'>('all');
    const [showAddStockModal, setShowAddStockModal] = useState<boolean>(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [livePrice, setLivePrice] = useState<number | null>(null);

    const purchases = transactions.filter(t => t.type === 'purchase' || t.type === 'BUY');
    const sells = transactions.filter(t => t.type === 'SELL');
    const cashIncome = transactions.filter(t => t.type === 'dividend' || t.type === 'MDIV' || t.type === 'CDIV' || t.type === 'SLIP');
    const dividendTransactions = transactions.filter(t => t.type === 'dividend' || t.type === 'MDIV' || t.type === 'CDIV');

    const totalShares = useMemo(() => {
        const sorted = [...transactions].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        let qty = 0;
        for (const t of sorted) {
            if (t.type === 'BUY' || t.type === 'purchase') qty += t.quantity;
            else if (t.type === 'SELL') qty -= t.quantity;
            else if (t.type === 'SPLIT') qty *= t.quantity;
        }
        return qty;
    }, [transactions]);
    const lastPurchasePrice = purchases.length > 0 ? purchases[purchases.length - 1].price : 0;
    const currentPrice = livePrice ?? lastPurchasePrice;
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [historyOpen, setHistoryOpen] = useState<boolean>(true);
    const [chartMounted, setChartMounted] = useState(false);

    const currentStock = stocks[currentStockIndex] ?? null;
    const currentTicker = currentStock?.ticker ?? '';

    useEffect(() => { setChartMounted(true); }, []);

    useEffect(() => {
        fetch('http://localhost:5001/api/stocks')
            .then(res => res.json())
            .then((data: Stock[]) => {
                if (data.length === 0) {
                    onBack('No ticker data found. Please import data first.');
                    return;
                }
                setStocks(data);
                setStocksLoaded(true);
                const hash = window.location.hash.slice(1).toUpperCase();
                if (hash) {
                    const idx = data.findIndex((s: Stock) => s.ticker.toUpperCase() === hash);
                    if (idx !== -1) setCurrentStockIndex(idx);
                }
            })
            .catch(err => console.error('Error fetching stocks:', err));
    }, []);

    useEffect(() => {
        fetch('http://localhost:5001/api/stocks/summary')
            .then(res => res.json())
            .then((data: Record<string, StockSummary>) => {
                setStockSummaries(data);
                setSummariesLoaded(true);
            })
            .catch(err => console.error('Error fetching stock summaries:', err));
    }, []);

    useEffect(() => {
        if (currentTicker) {
            window.location.hash = currentTicker;
        }
    }, [currentTicker]);

    useEffect(() => {
        if (!currentTicker) return;
        setTransactions([]);
        fetch(`http://localhost:5001/api/transactions?ticker=${currentTicker}`)
            .then(res => res.json())
            .then((data: Transaction[]) => setTransactions(data))
            .catch(err => console.error('Error fetching transactions:', err));
    }, [currentTicker]);

    useEffect(() => {
        if (!currentTicker) return;
        setLivePrice(null);
        fetch(`http://localhost:5001/api/price/${currentTicker}`)
            .then(res => res.ok ? res.json() : Promise.reject(res.status))
            .then((data: { price: number }) => setLivePrice(data.price))
            .catch(err => console.warn(`Live price unavailable for ${currentTicker}:`, err));
    }, [currentTicker]);

    const addTransaction = async (t: Omit<Transaction, 'id'>): Promise<void> => {
        try {
            const res = await fetch('http://localhost:5001/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...t, ticker: currentTicker, id: Date.now() })
            });
            if (res.ok) {
                const saved: Transaction = await res.json();
                setTransactions(prev => [...prev, saved].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            }
        } catch (err) {
            console.error('Error saving transaction:', err);
        }
    };

    const importTransactions = async (entries: Omit<Transaction, 'id'>[]): Promise<void> => {
        try {
            const tagged = entries.map((e, i) => ({ ...e, ticker: currentTicker, id: Date.now() + i }));
            const res = await fetch('http://localhost:5001/api/transactions/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tagged)
            });
            if (res.ok) {
                const saved: Transaction[] = await res.json();
                setTransactions(prev => [...prev, ...saved].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            }
        } catch (err) {
            console.error('Error importing transactions:', err);
        }
    };

    const deleteAllTransactions = async (): Promise<void> => {
        if (!confirm(`Delete all transaction history for ${currentTicker}? This cannot be undone.`)) return;
        try {
            const res = await fetch(`http://localhost:5001/api/transactions?ticker=${currentTicker}`, { method: 'DELETE' });
            if (res.ok) setTransactions([]);
        } catch (err) {
            console.error('Error deleting all transactions:', err);
        }
    };

    const deleteEntry = async (id: number): Promise<void> => {
        try {
            const res = await fetch(`http://localhost:5001/api/transactions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setTransactions(prev => prev.filter(t => t.id !== id));
            }
        } catch (err) {
            console.error('Error deleting entry:', err);
        }
    };

    const handleAddStock = async (name: string, ticker: string): Promise<void> => {
        try {
            const newStock: Stock = {
                id: ticker,
                ticker,
                name,
                createdAt: new Date().toISOString().split('T')[0]
            };
            const res = await fetch('http://localhost:5001/api/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newStock)
            });
            if (res.ok) {
                const saved: Stock = await res.json();
                setStocks(prev => {
                    const updated = [...prev, saved];
                    setCurrentStockIndex(updated.length - 1);
                    return updated;
                });
                setShowAddStockModal(false);
            } else if (res.status === 409) {
                alert(`Stock ${ticker} already exists.`);
            }
        } catch (err) {
            console.error('Error adding stock:', err);
        }
    };

    const handleRemoveStock = async (): Promise<void> => {
        if (!currentStock) return;
        if (!confirm(`Permanently delete ${currentStock.name} (${currentTicker}) and all its data? This cannot be undone.`)) return;
        try {
            const res = await fetch(`http://localhost:5001/api/stocks/${currentTicker}`, { method: 'DELETE' });
            if (res.ok) {
                setStocks(prev => {
                    const updated = prev.filter(s => s.ticker !== currentTicker);
                    setCurrentStockIndex(i => Math.max(0, Math.min(i, updated.length - 1)));
                    return updated;
                });
                setTransactions([]);
            }
        } catch (err) {
            console.error('Error removing stock:', err);
        }
    };

    const filteredStocks = useMemo(() => {
        if (!summariesLoaded) return stocks;
        return stocks.filter(s => {
            const summary = stockSummaries[s.ticker];
            if (filterStatus === 'active' && (!summary || summary.totalShares <= 0)) return false;
            if (filterStatus === 'inactive' && summary && summary.totalShares > 0) return false;
            if (filterMinValue > 0 && (summary?.marketValue ?? 0) < filterMinValue) return false;
            if (filterDividends === 'yes' && !summary?.hasDividends) return false;
            if (filterDividends === 'no' && summary?.hasDividends) return false;
            return true;
        }).sort((a, b) => a.ticker.localeCompare(b.ticker));
    }, [stocks, stockSummaries, summariesLoaded, filterStatus, filterMinValue, filterDividends]);

    const filteredIndex = filteredStocks.findIndex(s => s.ticker === currentTicker);

    // If active filters push current stock out of view, jump to first visible stock
    useEffect(() => {
        if (filteredStocks.length === 0) return;
        const ticker = stocks[currentStockIndex]?.ticker;
        if (!filteredStocks.some(s => s.ticker === ticker)) {
            setCurrentStockIndex(stocks.findIndex(s => s.ticker === filteredStocks[0].ticker));
        }
    }, [filteredStocks]); // eslint-disable-line react-hooks/exhaustive-deps

    const goToPrev = () => {
        const idx = Math.max(0, filteredIndex - 1);
        const stock = filteredStocks[idx];
        if (stock) setCurrentStockIndex(stocks.findIndex(s => s.ticker === stock.ticker));
    };
    const goToNext = () => {
        const idx = Math.min(filteredStocks.length - 1, filteredIndex + 1);
        const stock = filteredStocks[idx];
        if (stock) setCurrentStockIndex(stocks.findIndex(s => s.ticker === stock.ticker));
    };
    const handleNavigate = (filteredIdx: number) => {
        const stock = filteredStocks[filteredIdx];
        if (stock) setCurrentStockIndex(stocks.findIndex(s => s.ticker === stock.ticker));
    };

    const getHistoricalData = (): HistoricalDataPoint[] => {
        const dayMap = new Map<string, { qty: number; cost: number; lastPrice: number; dividendCost: number; splitRatio?: number }>();

        const sorted = [...transactions].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        for (const t of sorted) {
            const dayKey = t.date;
            const existing = dayMap.get(dayKey);
            const isBuy = t.type === 'BUY' || t.type === 'purchase';
            const isSell = t.type === 'SELL';
            const isCashIncome = t.type === 'dividend' || t.type === 'MDIV' || t.type === 'CDIV' || t.type === 'SLIP';
            const isSplit = t.type === 'SPLIT';
            const qtyDelta = isBuy ? t.quantity : isSell ? -t.quantity : 0;
            if (existing) {
                existing.qty += qtyDelta;
                if (isCashIncome) {
                    existing.dividendCost += t.price * t.quantity;
                } else if (isBuy) {
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
        let lastDividendAmount = 0;
        const result: HistoricalDataPoint[] = [];

        for (const dayKey of sortedDayKeys) {
            const data = dayMap.get(dayKey)!;
            runningQty += data.qty;
            runningCost += data.cost;
            runningDividendValue += data.dividendCost;
            // Apply split: multiply shares, divide price so value stays flat
            if (data.splitRatio) {
                runningQty *= data.splitRatio;
                if (lastKnownPrice > 0) lastKnownPrice /= data.splitRatio;
            }
            if (data.lastPrice > 0) lastKnownPrice = data.lastPrice;
            if (data.dividendCost > 0) lastDividendAmount = +data.dividendCost.toFixed(2);
            const parsedDate = parse(dayKey, 'yyyy-MM-dd', new Date());
            result.push({
                timestamp: parsedDate.getTime(),
                displayDate: format(parsedDate, 'MMM d, yyyy'),
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
        const lastDate = new Date(historicalData[historicalData.length - 1].timestamp);
        const useMonths = (lastDate.getTime() - firstDate.getTime()) < 365.25 * 24 * 60 * 60 * 1000;
        const bucketMap = new Map<string, HistoricalDataPoint>();
        for (const point of historicalData) {
            const date = new Date(point.timestamp);
            const key = useMonths ? format(date, 'yyyy-MM') : format(date, 'yyyy');
            bucketMap.set(key, point);
        }
        const sorted = [...bucketMap.entries()].sort(([a], [b]) => a.localeCompare(b));
        const data = sorted.map(([key, point], i) => {
            const prevValue = i > 0 ? sorted[i - 1][1].value : null;
            const deltaValue = prevValue !== null ? +(point.value - prevValue).toFixed(2) : null;
            return {
                label: useMonths ? format(parse(key, 'yyyy-MM', new Date()), 'MMM yyyy') : key,
                gainPct: point.cost > 0 ? +((point.value - point.cost) / point.cost * 100).toFixed(2) : 0,
                value: point.value,
                cost: point.cost,
                deltaValue,
            };
        });
        return { data, useMonths };
    };

    const toggleSort = () => {
        setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    };

    const combinedEntries: Transaction[] = [...transactions].sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        const diff = dateB.getTime() - dateA.getTime();
        if (diff !== 0) return sortOrder === 'desc' ? diff : -diff;
        return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
    });

    const historicalData = getHistoricalData();
    const { data: annualGrowthData, useMonths: growthUseMonths } = getAnnualGrowthData();

    const splitMarkers = transactions
        .filter(t => t.type === 'SPLIT')
        .map(t => ({
            timestamp: parse(t.date, 'yyyy-MM-dd', new Date()).getTime(),
            ratio: t.quantity,
            label: t.quantity >= 1
                ? `${+t.quantity.toFixed(4).replace(/\.?0+$/, '')}:1 Split`
                : `1:${+((1 / t.quantity).toFixed(4)).replace(/\.?0+$/, '')} Rev`,
        }));
    const avgGrowthPct = annualGrowthData.length > 0
        ? +(annualGrowthData.reduce((sum, d) => sum + d.gainPct, 0) / annualGrowthData.length).toFixed(2)
        : null;

    const maxDividendValue = Math.max(0, ...historicalData.map(d => d.dividendValue));
    const hasDividendData = maxDividendValue > 0;
    const dividendAxisMax = (() => {
        if (maxDividendValue <= 0) return 10;
        const magnitude = Math.pow(10, Math.floor(Math.log10(maxDividendValue)));
        const normalized = maxDividendValue / magnitude;
        const niceFactor =
            normalized <= 1 ? 1 :
            normalized <= 1.5 ? 1.5 :
            normalized <= 2 ? 2 :
            normalized <= 5 ? 5 : 10;
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

    if (!stocksLoaded) {
        return (
            <div className="dashboard-container flex items-center justify-center" style={{ minHeight: '60vh' }}>
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
            />

            {/* Filter bar */}
            <div className="glass-card" style={{ padding: '10px 16px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <SlidersHorizontal size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Status:</span>
                        {(['all', 'active', 'inactive'] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setFilterStatus(s)}
                                style={{
                                    padding: '3px 10px',
                                    fontSize: '12px',
                                    borderRadius: '6px',
                                    border: '1px solid',
                                    cursor: 'pointer',
                                    borderColor: filterStatus === s ? 'var(--primary-purple)' : 'var(--card-border)',
                                    background: filterStatus === s ? 'rgba(123,63,228,0.2)' : 'transparent',
                                    color: filterStatus === s ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {s === 'active' ? 'Active' : s === 'inactive' ? 'Inactive' : 'All'}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Min Value:</span>
                        <select
                            value={filterMinValue}
                            onChange={e => setFilterMinValue(Number(e.target.value))}
                            style={{
                                fontSize: '12px',
                                color: filterMinValue > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                                background: 'var(--card-bg)',
                                border: `1px solid ${filterMinValue > 0 ? 'var(--primary-purple)' : 'var(--card-border)'}`,
                                borderRadius: '6px',
                                padding: '3px 22px 3px 8px',
                                cursor: 'pointer',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 6px center',
                            }}
                        >
                            <option value={0}>Any</option>
                            <option value={500}>$500+</option>
                            <option value={1000}>$1,000+</option>
                            <option value={5000}>$5,000+</option>
                            <option value={10000}>$10,000+</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Dividends:</span>
                        {(['all', 'yes', 'no'] as const).map(d => (
                            <button
                                key={d}
                                onClick={() => setFilterDividends(d)}
                                style={{
                                    padding: '3px 10px',
                                    fontSize: '12px',
                                    borderRadius: '6px',
                                    border: '1px solid',
                                    cursor: 'pointer',
                                    borderColor: filterDividends === d ? 'var(--primary-blue)' : 'var(--card-border)',
                                    background: filterDividends === d ? 'rgba(0,123,255,0.15)' : 'transparent',
                                    color: filterDividends === d ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {d === 'yes' ? 'With' : d === 'no' ? 'Without' : 'All'}
                            </button>
                        ))}
                    </div>

                    <div style={{ marginLeft: 'auto', fontSize: '12px', color: summariesLoaded && (filterStatus !== 'all' || filterMinValue > 0 || filterDividends !== 'all') ? 'var(--warning-orange)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {filteredStocks.length} / {stocks.length} stocks
                    </div>
                </div>
            </div>

            <header className="mb-8 mt-4">
                <Ticker
                    symbol={currentTicker}
                    name={currentStock?.name}
                    price={currentPrice}
                    isLive={livePrice !== null}
                    totalShares={totalShares}
                    marketValue={totalShares * currentPrice}
                    totalInvested={purchases.reduce((sum, p) => sum + p.quantity * p.price, 0)}
                    sellProceeds={sells.reduce((sum, s) => sum + s.quantity * s.price, 0)}
                    cashIncome={cashIncome.reduce((sum, t) => sum + t.quantity * t.price, 0)}
                    dividendIncome={dividendTransactions.reduce((sum, t) => sum + t.quantity * t.price, 0)}
                    avgPurchasePrice={totalShares > 0 ? purchases.reduce((sum, p) => sum + p.quantity * p.price, 0) / totalShares : null}
                    earliestPurchaseDate={purchases.length > 0 ? purchases.reduce((earliest, p) => p.date < earliest ? p.date : earliest, purchases[0].date) : null}
                    activeInvestmentYears={purchases.length > 0 ? new Set(purchases.map(p => new Date(p.date).getFullYear())).size : null}
                />
            </header>

            {showAddStockModal && (
                <AddStockModal
                    onAdd={handleAddStock}
                    onClose={() => setShowAddStockModal(false)}
                />
            )}

            <div className="dashboard-scroll-area">
            <main className="grid gap-8">
                <section className="glass-card">
                    <div className="flex items-center gap-2 mb-6">
                        <Plus className="text-accent-purple" size={24} />
                        <h2>Transactions</h2>
                    </div>
                    <TransactionForm onAdd={addTransaction} onImport={importTransactions} />
                </section>

                <section className="glass-card">
                    <div className="accordion-header">
                        <button
                            onClick={() => setHistoryOpen(prev => !prev)}
                            className="flex items-center gap-2 flex-1"
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                        >
                            <div className="flex items-center gap-2">
                                <History className="text-accent-blue" size={24} />
                                <h2>Transaction History</h2>
                            </div>
                        </button>
                        <div className="flex items-center gap-2">
                            {transactions.length > 0 && (
                                <button
                                    onClick={deleteAllTransactions}
                                    className="btn-delete"
                                    title="Clear all transactions"
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '0.75rem' }}
                                >
                                    <Trash2 size={14} />
                                    Clear All
                                </button>
                            )}
                            <button
                                onClick={() => setHistoryOpen(prev => !prev)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                            >
                                {historyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                        </div>
                    </div>
                    {historyOpen && (
                        <HistoryTable
                            purchases={combinedEntries}
                            onSortToggle={toggleSort}
                            sortOrder={sortOrder}
                            onDelete={deleteEntry}
                        />
                    )}
                </section>

                <section className="glass-card">
                    <div className="flex items-center mb-6" style={{ position: 'relative' }}>
                        <BarChart3 className="text-accent-green" size={24} />
                        <h2 className="ml-2">Accumulation Graph</h2>
                        <div className="flex items-center gap-4" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                            <div className="flex items-center gap-2">
                                <div style={{ width: '24px', height: '0', borderTop: '2px dashed var(--primary-blue)' }} />
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Current Value</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div style={{ width: '24px', height: '3px', background: 'var(--primary-purple)', borderRadius: '2px' }} />
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Spent</span>
                            </div>
                            {hasDividendData && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <div style={{ width: '24px', height: '3px', background: 'var(--success-green)', borderRadius: '2px' }} />
                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Dividends Received</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div style={{ width: '24px', height: '0', borderTop: '2px dashed #f59e0b' }} />
                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Last Dividend</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <div style={{ height: '300px', width: '100%', minWidth: 0 }}>
                        {historicalData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-text-secondary italic">
                                Add a purchase to see historical data.
                            </div>
                        ) : chartMounted ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={historicalData}>
                                    <defs>
                                        <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--primary-purple)" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="var(--primary-purple)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="timestamp"
                                        type="number"
                                        scale="time"
                                        domain={['dataMin', 'dataMax']}
                                        ticks={monthTicks}
                                        tickFormatter={(ts: number) => format(new Date(ts), 'MMM yyyy')}
                                        stroke="var(--text-secondary)"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        stroke="var(--text-secondary)"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                                    />
                                    {hasDividendData && (
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            stroke="#f59e0b"
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                            domain={[0, dividendAxisMax]}
                                            tickFormatter={(value) => `$${value}`}
                                        />
                                    )}
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)', borderRadius: '8px' }}
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const point = historicalData.find(d => d.timestamp === label);
                                            const displayDate = point ? point.displayDate : format(new Date(label as number), 'MMM d, yyyy');
                                            const colorMap: Record<string, string> = {
                                                'Total Spent': 'var(--primary-purple)',
                                                'Current Value': 'var(--primary-blue)',
                                                'Dividends Received': 'var(--success-green)',
                                                'Last Dividend': '#f59e0b',
                                            };
                                            const order = hasDividendData
                                                ? ['Current Value', 'Total Spent', 'Dividends Received', 'Last Dividend']
                                                : ['Current Value', 'Total Spent'];
                                            const filteredPayload = hasDividendData
                                                ? payload
                                                : payload.filter(e => e.name !== 'Dividends Received' && e.name !== 'Last Dividend');
                                            return (
                                                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '10px 14px' }}>
                                                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '8px' }}>{displayDate}</p>
                                                    {[...filteredPayload].sort((a, b) => {
                                                        return order.indexOf(a.name as string) - order.indexOf(b.name as string);
                                                    }).map((entry) => (
                                                        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: colorMap[entry.name as string] ?? entry.color, flexShrink: 0 }} />
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{entry.name}:</span>
                                                            <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
                                                                ${(entry.value as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                        stroke="var(--primary-purple)"
                                        fillOpacity={1}
                                        fill="url(#colorCost)"
                                        strokeWidth={3}
                                        name="Total Spent"
                                    />
                                    <Area
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="value"
                                        stroke="var(--primary-blue)"
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
                                                stroke="var(--success-green)"
                                                fill="transparent"
                                                strokeWidth={2}
                                                name="Dividends Received"
                                            />
                                            <Area
                                                yAxisId="right"
                                                type="stepAfter"
                                                dataKey="lastDividendAmount"
                                                stroke="#f59e0b"
                                                fill="transparent"
                                                strokeWidth={2}
                                                strokeDasharray="5 5"
                                                name="Last Dividend"
                                            />
                                        </>
                                    )}
                                    {splitMarkers.map(marker => (
                                        <ReferenceLine
                                            key={marker.timestamp}
                                            yAxisId="left"
                                            x={marker.timestamp}
                                            stroke="#a78bfa"
                                            strokeDasharray="4 4"
                                            label={{ value: marker.label, position: 'insideTopRight', fontSize: 10, fill: '#a78bfa' }}
                                        />
                                    ))}
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : null}
                    </div>
                </section>

                <section className="glass-card">
                    <div className="flex items-center mb-6" style={{ position: 'relative' }}>
                        <BarChart3 className="text-accent-purple" size={24} />
                        <h2 className="ml-2">Annual Growth</h2>
                        {avgGrowthPct !== null && (
                            <div className="flex items-center gap-2" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                                <div style={{ width: '24px', height: '0', borderTop: '2px dashed #f59e0b' }} />
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    Avg: {avgGrowthPct >= 0 ? '+' : ''}{avgGrowthPct}%
                                </span>
                            </div>
                        )}
                    </div>
                    <div style={{ height: '300px', width: '100%', minWidth: 0 }}>
                        {annualGrowthData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-text-secondary italic">
                                Add a purchase to see growth data.
                            </div>
                        ) : chartMounted ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <ComposedChart data={annualGrowthData} margin={{ top: 8, right: 56, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        stroke="var(--text-secondary)"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        label={growthUseMonths ? undefined : { value: 'Year', position: 'insideBottom', offset: -4, fill: 'var(--text-secondary)', fontSize: 12 }}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        stroke="var(--text-secondary)"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v) => `${v}%`}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        stroke="#60a5fa"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v) => {
                                            const abs = Math.abs(v);
                                            if (abs >= 1000) return `${v < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`;
                                            return `${v < 0 ? '-' : ''}$${abs.toFixed(0)}`;
                                        }}
                                    />
                                    <ReferenceLine yAxisId="left" y={0} stroke="var(--text-secondary)" strokeOpacity={0.4} />
                                    {avgGrowthPct !== null && (
                                        <ReferenceLine yAxisId="left" y={avgGrowthPct} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={2} />
                                    )}
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload as { label: string; gainPct: number; value: number; cost: number; deltaValue: number | null };
                                            const gain = d.value - d.cost;
                                            const rows: { label: string; value: string; color: string }[] = [
                                                { label: 'Current Value', value: `$${d.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'var(--primary-blue)' },
                                                { label: 'Total Invested', value: `$${d.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'var(--primary-purple)' },
                                                { label: 'Gain / Loss', value: `${gain >= 0 ? '+' : ''}$${gain.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: gain >= 0 ? 'var(--success-green)' : '#ef4444' },
                                                { label: 'Gain %', value: `${d.gainPct >= 0 ? '+' : ''}${d.gainPct}%`, color: d.gainPct >= 0 ? 'var(--success-green)' : '#ef4444' },
                                            ];
                                            if (d.deltaValue !== null) {
                                                rows.push({ label: `${growthUseMonths ? 'MoM' : 'YoY'} Change`, value: `${d.deltaValue >= 0 ? '+' : ''}$${d.deltaValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: d.deltaValue >= 0 ? '#60a5fa' : '#f87171' });
                                            }
                                            return (
                                                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '10px 14px' }}>
                                                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '8px' }}>{d.label}</p>
                                                    {rows.map(row => (
                                                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: row.color, flexShrink: 0 }} />
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{row.label}:</span>
                                                            <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{row.value}</span>
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
                                            <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                                                {value === 'gainPct' ? 'Gain %' : `${growthUseMonths ? 'MoM' : 'YoY'} $ Change`}
                                            </span>
                                        )}
                                    />
                                    <Bar yAxisId="left" dataKey="gainPct" radius={[4, 4, 0, 0]} maxBarSize={64} name="gainPct">
                                        {annualGrowthData.map((entry, index) => (
                                            <Cell
                                                key={index}
                                                fill={entry.gainPct >= 0 ? 'var(--success-green)' : 'var(--error-red, #ef4444)'}
                                                fillOpacity={0.85}
                                            />
                                        ))}
                                    </Bar>
                                    <Line
                                        yAxisId="right"
                                        dataKey="deltaValue"
                                        name={`${growthUseMonths ? 'MoM' : 'YoY'} $ Change`}
                                        type="monotone"
                                        stroke="#60a5fa"
                                        strokeWidth={2}
                                        dot={{ fill: '#60a5fa', r: 4, strokeWidth: 0 }}
                                        activeDot={{ r: 6 }}
                                        connectNulls={false}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : null}
                    </div>
                </section>

                <ProjectionView purchases={purchases} currentPrice={currentPrice} ticker={currentTicker} hasDividends={cashIncome.length > 0} />
            </main>
            </div>
        </div>
    );
};

export default Dashboard;
