import { useState, useEffect } from 'react';
import Ticker from './components/Ticker';
import PurchaseForm from './components/PurchaseForm';
import DividendForm from './components/DividendForm';
import HistoryTable from './components/HistoryTable';
import ProjectionView from './components/ProjectionView';
import StockNavigator from './components/StockNavigator';
import AddStockModal from './components/AddStockModal';
import { Plus, History, BarChart3, ChevronDown, ChevronUp, DollarSign, Trash2 } from 'lucide-react';
import { AreaChart, Area, Bar, ComposedChart, Line, Cell, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parse, startOfMonth } from 'date-fns';
import type { Purchase, Dividend, CombinedEntry, Stock } from './types';

interface HistoricalDataPoint {
    timestamp: number;    // Unix ms — numeric XAxis dataKey
    displayDate: string;  // "Mar 17, 2026" — for tooltip label
    value: number;
    cost: number;
    qty: number;
    dividendValue: number;
    lastDividendAmount: number; // most recent single dividend payment up to this point
}

const Dashboard = () => {
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [currentStockIndex, setCurrentStockIndex] = useState<number>(0);
    const [showAddStockModal, setShowAddStockModal] = useState<boolean>(false);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [dividends, setDividends] = useState<Dividend[]>([]);
    const [livePrice, setLivePrice] = useState<number | null>(null);
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
                setStocks(data);
                const hash = window.location.hash.slice(1).toUpperCase();
                if (hash) {
                    const idx = data.findIndex((s: Stock) => s.ticker.toUpperCase() === hash);
                    if (idx !== -1) setCurrentStockIndex(idx);
                }
            })
            .catch(err => console.error('Error fetching stocks:', err));
    }, []);

    useEffect(() => {
        if (currentTicker) {
            window.location.hash = currentTicker;
        }
    }, [currentTicker]);

    useEffect(() => {
        if (!currentTicker) return;
        setPurchases([]);
        fetch(`http://localhost:5001/api/purchases?ticker=${currentTicker}`)
            .then(res => res.json())
            .then((data: Purchase[]) => setPurchases(data))
            .catch(err => console.error('Error fetching purchases:', err));
    }, [currentTicker]);

    useEffect(() => {
        if (!currentTicker) return;
        setDividends([]);
        fetch(`http://localhost:5001/api/dividends?ticker=${currentTicker}`)
            .then(res => res.json())
            .then((data: Dividend[]) => setDividends(data))
            .catch(err => console.error('Error fetching dividends:', err));
    }, [currentTicker]);

    useEffect(() => {
        if (!currentTicker) return;
        setLivePrice(null);
        fetch(`http://localhost:5001/api/price/${currentTicker}`)
            .then(res => res.ok ? res.json() : Promise.reject(res.status))
            .then((data: { price: number }) => setLivePrice(data.price))
            .catch(err => console.warn(`Live price unavailable for ${currentTicker}:`, err));
    }, [currentTicker]);

    const addPurchase = async (purchase: Purchase): Promise<void> => {
        try {
            const res = await fetch('http://localhost:5001/api/purchases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...purchase, ticker: currentTicker })
            });
            if (res.ok) {
                const savedPurchase: Purchase = await res.json();
                setPurchases(prev => {
                    const updated = [...prev, savedPurchase];
                    return updated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                });
            }
        } catch (err) {
            console.error('Error saving purchase:', err);
        }
    };

    const importPurchases = async (entries: Purchase[]): Promise<void> => {
        try {
            const tagged = entries.map(e => ({ ...e, ticker: currentTicker }));
            const res = await fetch('http://localhost:5001/api/purchases/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tagged)
            });
            if (res.ok) {
                const saved: Purchase[] = await res.json();
                setPurchases(prev => {
                    const updated = [...prev, ...saved];
                    return updated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                });
            }
        } catch (err) {
            console.error('Error importing purchases:', err);
        }
    };

    const addDividend = async (dividend: Dividend): Promise<void> => {
        try {
            const res = await fetch('http://localhost:5001/api/dividends', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...dividend, ticker: currentTicker })
            });
            if (res.ok) {
                const savedDividend: Dividend = await res.json();
                setDividends(prev => {
                    const updated = [...prev, savedDividend];
                    return updated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                });
            }
        } catch (err) {
            console.error('Error saving dividend:', err);
        }
    };

    const importDividends = async (entries: Dividend[]): Promise<void> => {
        try {
            const tagged = entries.map(e => ({ ...e, ticker: currentTicker }));
            const res = await fetch('http://localhost:5001/api/dividends/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tagged)
            });
            if (res.ok) {
                const saved: Dividend[] = await res.json();
                setDividends(prev => {
                    const updated = [...prev, ...saved];
                    return updated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                });
            }
        } catch (err) {
            console.error('Error importing dividends:', err);
        }
    };

    const deleteAllPurchases = async (): Promise<void> => {
        if (!confirm(`Delete all purchase history for ${currentTicker}? This cannot be undone.`)) return;
        try {
            const res = await fetch(`http://localhost:5001/api/purchases?ticker=${currentTicker}`, { method: 'DELETE' });
            if (res.ok) setPurchases([]);
        } catch (err) {
            console.error('Error deleting all purchases:', err);
        }
    };

    const deleteEntry = async (id: number, type: string): Promise<void> => {
        const endpoint = type === 'dividend'
            ? `http://localhost:5001/api/dividends/${id}`
            : `http://localhost:5001/api/purchases/${id}`;
        try {
            const res = await fetch(endpoint, { method: 'DELETE' });
            if (res.ok) {
                if (type === 'dividend') {
                    setDividends(prev => prev.filter(d => d.id !== id));
                } else {
                    setPurchases(prev => prev.filter(p => p.id !== id));
                }
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
            await Promise.all([
                fetch(`http://localhost:5001/api/purchases?ticker=${currentTicker}`, { method: 'DELETE' }),
                fetch(`http://localhost:5001/api/dividends?ticker=${currentTicker}`, { method: 'DELETE' }),
            ]);
            const res = await fetch(`http://localhost:5001/api/stocks/${currentTicker}`, { method: 'DELETE' });
            if (res.ok) {
                setStocks(prev => {
                    const updated = prev.filter(s => s.ticker !== currentTicker);
                    setCurrentStockIndex(i => Math.max(0, Math.min(i, updated.length - 1)));
                    return updated;
                });
                setPurchases([]);
                setDividends([]);
            }
        } catch (err) {
            console.error('Error removing stock:', err);
        }
    };

    const goToPrev = () => setCurrentStockIndex(i => Math.max(0, i - 1));
    const goToNext = () => setCurrentStockIndex(i => Math.min(stocks.length - 1, i + 1));

    const getHistoricalData = (): HistoricalDataPoint[] => {
        const dayMap = new Map<string, { qty: number; cost: number; lastPrice: number; dividendCost: number }>();

        const sorted = [...purchases, ...dividends.map(d => ({ ...d, type: 'dividend' as const }))].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        for (const p of sorted) {
            const dayKey = p.date;
            const existing = dayMap.get(dayKey);
            const isDividend = 'type' in p && p.type === 'dividend';
            if (existing) {
                existing.qty += p.quantity;
                if (isDividend) {
                    existing.dividendCost += p.price * p.quantity;
                } else {
                    existing.cost += p.price * p.quantity;
                    existing.lastPrice = p.price;
                }
            } else {
                dayMap.set(dayKey, {
                    qty: p.quantity,
                    cost: isDividend ? 0 : p.price * p.quantity,
                    lastPrice: isDividend ? 0 : p.price,
                    dividendCost: isDividend ? p.price * p.quantity : 0,
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

    const combinedEntries: CombinedEntry[] = [
        ...purchases.map(p => ({ ...p, type: 'purchase' as const })),
        ...dividends.map(d => ({ ...d, type: 'dividend' as const }))
    ].sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        const diff = dateB.getTime() - dateA.getTime();
        if (diff !== 0) return sortOrder === 'desc' ? diff : -diff;
        return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
    });

    const historicalData = getHistoricalData();
    const { data: annualGrowthData, useMonths: growthUseMonths } = getAnnualGrowthData();
    const avgGrowthPct = annualGrowthData.length > 0
        ? +(annualGrowthData.reduce((sum, d) => sum + d.gainPct, 0) / annualGrowthData.length).toFixed(2)
        : null;

    const maxDividendValue = Math.max(0, ...historicalData.map(d => d.dividendValue));
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

    if (stocks.length === 0) {
        return (
            <div className="dashboard-container flex items-center justify-center" style={{ minHeight: '60vh' }}>
                <div className="text-text-secondary italic">Loading...</div>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <StockNavigator
                stocks={stocks}
                currentIndex={currentStockIndex}
                onPrev={goToPrev}
                onNext={goToNext}
                onAddStock={() => setShowAddStockModal(true)}
                onRemoveStock={handleRemoveStock}
            />

            <header className="mb-8 mt-4">
                <Ticker
                    symbol={currentTicker}
                    name={currentStock?.name}
                    price={currentPrice}
                    isLive={livePrice !== null}
                    totalShares={[...purchases, ...dividends].reduce((sum, p) => sum + p.quantity, 0)}
                    totalValue={[...purchases, ...dividends].reduce((sum, p) => sum + p.quantity, 0) * currentPrice}
                    totalInvested={purchases.reduce((sum, p) => sum + p.quantity * p.price, 0)}
                    totalDividends={dividends.reduce((sum, d) => sum + d.quantity * d.price, 0)}
                    avgPurchasePrice={purchases.length > 0 ? purchases.reduce((sum, p) => sum + p.price, 0) / purchases.length : null}
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
                        <h2>Add Purchase</h2>
                    </div>
                    <PurchaseForm onAdd={addPurchase} onImport={importPurchases} />
                </section>

                <section className="glass-card">
                    <div className="flex items-center gap-2 mb-6">
                        <DollarSign className="text-accent-green" size={24} />
                        <h2>Add Dividend</h2>
                    </div>
                    <DividendForm onAdd={addDividend} onImport={importDividends} />
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
                                <h2>Purchase History</h2>
                            </div>
                        </button>
                        <div className="flex items-center gap-2">
                            {purchases.length > 0 && (
                                <button
                                    onClick={deleteAllPurchases}
                                    className="btn-delete"
                                    title="Clear all purchases"
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
                            {dividends.length > 0 && (
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
                                    {dividends.length > 0 && (
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
                                            const order = dividends.length > 0
                                                ? ['Current Value', 'Total Spent', 'Dividends Received', 'Last Dividend']
                                                : ['Current Value', 'Total Spent'];
                                            const filteredPayload = dividends.length > 0
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
                                    {dividends.length > 0 && (
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

                <ProjectionView purchases={purchases} currentPrice={currentPrice} ticker={currentTicker} hasDividends={dividends.length > 0} />
            </main>
            </div>
        </div>
    );
};

export default Dashboard;
