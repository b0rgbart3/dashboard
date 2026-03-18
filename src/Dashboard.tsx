import { useState, useEffect } from 'react';
import Ticker from './components/Ticker';
import PurchaseForm from './components/PurchaseForm';
import DividendForm from './components/DividendForm';
import HistoryTable from './components/HistoryTable';
import ProjectionView from './components/ProjectionView';
import { TrendingUp, History, BarChart3, ChevronDown, ChevronUp, DollarSign } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parse, startOfMonth } from 'date-fns';
import type { Purchase, Dividend, CombinedEntry } from './types';

interface HistoricalDataPoint {
    timestamp: number;    // Unix ms — numeric XAxis dataKey
    displayDate: string;  // "Mar 17, 2026" — for tooltip label
    value: number;
    cost: number;
    qty: number;
}

const Dashboard = () => {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [dividends, setDividends] = useState<Dividend[]>([]);
    const [currentPrice, setCurrentPrice] = useState<number>(100.06);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [historyOpen, setHistoryOpen] = useState<boolean>(true);

    useEffect(() => {
        fetch('http://localhost:5001/api/purchases')
            .then(res => res.json())
            .then((data: Purchase[]) => setPurchases(data))
            .catch(err => console.error('Error fetching purchases:', err));
    }, []);

    useEffect(() => {
        fetch('http://localhost:5001/api/dividends')
            .then(res => res.json())
            .then((data: Dividend[]) => setDividends(data))
            .catch(err => console.error('Error fetching dividends:', err));
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentPrice(prev => +(prev + (Math.random() - 0.5) * 0.5).toFixed(2));
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const addPurchase = async (purchase: Purchase): Promise<void> => {
        try {
            const res = await fetch('http://localhost:5001/api/purchases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(purchase)
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
            const res = await fetch('http://localhost:5001/api/purchases/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entries)
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
                body: JSON.stringify(dividend)
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
            const res = await fetch('http://localhost:5001/api/dividends/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entries)
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

    const getHistoricalData = (): HistoricalDataPoint[] => {
        const dayMap = new Map<string, { qty: number; cost: number; lastPrice: number }>();

        const sorted = [...purchases].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        for (const p of sorted) {
            const dayKey = p.date; // already "yyyy-MM-dd"
            const existing = dayMap.get(dayKey);
            if (existing) {
                existing.qty += p.quantity;
                existing.cost += p.price * p.quantity;
                existing.lastPrice = p.price;
            } else {
                dayMap.set(dayKey, { qty: p.quantity, cost: p.price * p.quantity, lastPrice: p.price });
            }
        }

        const sortedDayKeys = [...dayMap.keys()].sort();

        let runningQty = 0;
        let runningCost = 0;
        const result: HistoricalDataPoint[] = [];

        for (const dayKey of sortedDayKeys) {
            const data = dayMap.get(dayKey)!;
            runningQty += data.qty;
            runningCost += data.cost;
            const parsedDate = parse(dayKey, 'yyyy-MM-dd', new Date());
            result.push({
                timestamp: parsedDate.getTime(),
                displayDate: format(parsedDate, 'MMM d, yyyy'),
                value: +(runningQty * data.lastPrice).toFixed(2),
                cost: +runningCost.toFixed(2),
                qty: runningQty,
            });
        }

        return result;
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

    return (
        <div className="dashboard-container">
            <header className="mb-8">
                <Ticker symbol="STRC" price={currentPrice} />
            </header>

            <main className="grid gap-8">
                <section className="glass-card">
                    <div className="flex items-center gap-2 mb-6">
                        <TrendingUp className="text-accent-purple" size={24} />
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
                    <button
                        onClick={() => setHistoryOpen(prev => !prev)}
                        className="accordion-header"
                    >
                        <div className="flex items-center gap-2">
                            <History className="text-accent-blue" size={24} />
                            <h2>Purchase History</h2>
                        </div>
                        {historyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
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
                                <div style={{ width: '24px', height: '3px', background: 'var(--primary-purple)', borderRadius: '2px' }} />
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Current Value</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div style={{ width: '24px', height: '0', borderTop: '2px dashed var(--primary-blue)' }} />
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Spent</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ height: '300px', width: '100%' }}>
                        {historicalData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={historicalData}>
                                    <defs>
                                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
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
                                        stroke="var(--text-secondary)"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `$${value}`}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)', borderRadius: '8px' }}
                                        itemStyle={{ color: 'var(--text-primary)' }}
                                        labelFormatter={(ts: number) => {
                                            const point = historicalData.find(d => d.timestamp === ts);
                                            return point ? point.displayDate : format(new Date(ts), 'MMM d, yyyy');
                                        }}
                                        formatter={(value: number) =>
                                            `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        }
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="var(--primary-purple)"
                                        fillOpacity={1}
                                        fill="url(#colorValue)"
                                        strokeWidth={3}
                                        name="Current Value"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="cost"
                                        stroke="var(--primary-blue)"
                                        fill="transparent"
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        name="Total Spent"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-text-secondary italic">
                                Add a purchase to see historical data.
                            </div>
                        )}
                    </div>
                </section>

                <ProjectionView purchases={purchases} currentPrice={currentPrice} />
            </main>
        </div>
    );
};

export default Dashboard;
