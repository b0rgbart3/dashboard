import { useState, useEffect } from 'react';
import { BarChart3, PieChart, ChevronDown, ChevronUp } from 'lucide-react';
import { format, addMonths, startOfMonth } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { Purchase } from '../types';

import type { ProjectionSettings } from '../types';

interface ProjectionViewProps {
    purchases: Purchase[];
    currentPrice: number;
    ticker: string;
    hasDividends: boolean;
}

interface ProjectionDataPoint {
    date: string;
    displayDate: string;
    qty: number;
    value: number;
    monthlyCost: number;
    dividend: number;
    spent: number;
    income: number;
    monthlyIncome: number;
    type: 'Actual' | 'Projected';
}

const ProjectionView = ({ purchases, ticker, hasDividends }: ProjectionViewProps) => {
    const [projectedMonthlyStack, setProjectedMonthlyStack] = useState<string>('200');
    const [decayMonths, setDecayMonths] = useState<string>('20');
    const [projectedCost, setProjectedCost] = useState<string>('100');
    const [dividendInput, setDividendInput] = useState<string>('11.5');
    const [taperDate, setTaperDate] = useState<string>('2028-05');
    const [taperLength, setTaperLength] = useState<string>('12');
    const [targetIncome, setTargetIncome] = useState<string>('2400');
    const [projectionLength, setProjectionLength] = useState<string>('60');
    const [useTaper, setUseTaper] = useState<boolean>(true);
    const [projectionOpen, setProjectionOpen] = useState<boolean>(true);
    const [showHistory, setShowHistory] = useState<boolean>(false);
    const [chartMounted, setChartMounted] = useState(false);

    useEffect(() => { setChartMounted(true); }, []);

    // Load saved settings when ticker changes
    useEffect(() => {
        if (!ticker) return;
        fetch(`http://localhost:5001/api/projection-settings/${ticker}`)
            .then(res => res.json())
            .then((settings: ProjectionSettings) => {
                if (settings && Object.keys(settings).length > 0) {
                    setProjectedMonthlyStack(settings.monthlyStack);
                    setDecayMonths(settings.decayMonths);
                    setProjectedCost(settings.stockPrice);
                    setDividendInput(settings.dividendInput);
                    setTaperDate(settings.taperDate);
                    setTaperLength(settings.taperLength);
                    setTargetIncome(settings.targetIncome);
                    setProjectionLength(settings.projectionLength);
                    setUseTaper(settings.useTaper);
                }
            })
            .catch(err => console.error('Error loading projection settings:', err));
    }, [ticker]);

    // Debounced save whenever settings change
    useEffect(() => {
        if (!ticker) return;
        const timer = setTimeout(() => {
            fetch(`http://localhost:5001/api/projection-settings/${ticker}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    monthlyStack: projectedMonthlyStack,
                    decayMonths,
                    stockPrice: projectedCost,
                    dividendInput,
                    taperDate,
                    taperLength,
                    targetIncome,
                    projectionLength,
                    useTaper,
                } satisfies ProjectionSettings),
            }).catch(err => console.error('Error saving projection settings:', err));
        }, 400);
        return () => clearTimeout(timer);
    }, [ticker, projectedMonthlyStack, decayMonths, projectedCost, dividendInput,
        taperDate, taperLength, targetIncome, projectionLength, useTaper]);

    if (purchases.length === 0) {
        return (
            <div className="text-text-secondary italic py-8 text-center">
                Projections will appear here once initial values are set.
            </div>
        );
    }

    const sortedPurchases = [...purchases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastPurchase = sortedPurchases[sortedPurchases.length - 1];
    const lastDate = new Date(lastPurchase.date);

    const totalQty = purchases.reduce((sum, p) => sum + p.quantity, 0);


    const monthlyStackInput = parseFloat(projectedMonthlyStack);
    const monthlyStack = !isNaN(monthlyStackInput) && monthlyStackInput > 0 ? monthlyStackInput : 0;
    const decay = parseFloat(decayMonths) || 0;
    const monthlyCost = parseFloat(projectedCost) || 0;
    const dividendPct = (parseFloat(dividendInput) || 0) / 100;
    const taperDateValue = taperDate ? new Date(taperDate + '-01') : null;
    const taperLen = parseInt(taperLength) || 0;
    const taperDateLabel = taperDateValue ? format(taperDateValue, 'MMM yyyy') : null;

    const targetIncomeValue = parseFloat(targetIncome) || 0;

    const projectionData: ProjectionDataPoint[] = [];
    let runningQty = totalQty;

    // Use the last purchase price as a static base — not the live ticker price
    const baseValue = +(totalQty * lastPurchase.price).toFixed(2);
    const baseDividend = +(baseValue * dividendPct / 12).toFixed(2);
    projectionData.push({
        date: format(lastDate, 'MMM yyyy'),
        displayDate: format(lastDate, 'MMMM yyyy'),
        qty: +runningQty.toFixed(2),
        value: baseValue,
        monthlyCost: 0,
        dividend: baseDividend,
        spent: baseValue,
        income: 0,
        monthlyIncome: 0,
        type: 'Actual'
    });

    let prevValue = baseValue;
    let prevDividend = baseDividend;
    let runningSpent = baseValue;
    let runningIncome = 0;
    const projMonths = Math.max(1, parseInt(projectionLength) || 60);
    for (let i = 1; i <= projMonths; i++) {
        const nextDate = addMonths(startOfMonth(lastDate), i);
        const effectiveStack = decay > 0
            ? Math.max(0, monthlyStack - (i - 1) * (monthlyStack / decay))
            : monthlyStack;
        runningQty += effectiveStack;
        const rowMonthlyCost = effectiveStack * monthlyCost;

        let reinvestedDividend: number;
        let monthlyIncome: number;

        if (useTaper) {
            // Taper mode: linearly shift dividends from reinvestment to income
            let taperFactor = 1;
            if (taperDateValue && taperLen > 0) {
                const monthsIntotaper =
                    (nextDate.getFullYear() - taperDateValue.getFullYear()) * 12 +
                    (nextDate.getMonth() - taperDateValue.getMonth());
                if (monthsIntotaper >= 0) {
                    taperFactor = Math.max(0, (taperLen - monthsIntotaper) / taperLen);
                }
            }
            reinvestedDividend = +(prevDividend * taperFactor).toFixed(2);
            monthlyIncome = +(prevDividend - reinvestedDividend).toFixed(2);
            if (targetIncomeValue > 0 && monthlyIncome > targetIncomeValue) {
                monthlyIncome = targetIncomeValue;
                reinvestedDividend = +(prevDividend - monthlyIncome).toFixed(2);
            }
        } else {
            // Threshold mode: reinvest everything until dividend reaches target, then take target as income
            if (targetIncomeValue > 0 && prevDividend >= targetIncomeValue) {
                monthlyIncome = targetIncomeValue;
                reinvestedDividend = +(prevDividend - monthlyIncome).toFixed(2);
            } else {
                monthlyIncome = 0;
                reinvestedDividend = prevDividend;
            }
        }
        runningIncome = +(runningIncome + monthlyIncome).toFixed(2);

        const projValue = +(prevValue + reinvestedDividend + rowMonthlyCost).toFixed(2);
        const projDividend = +(projValue * dividendPct / 12).toFixed(2);
        runningSpent = +(runningSpent + rowMonthlyCost).toFixed(2);
        projectionData.push({
            date: format(nextDate, 'MMM yyyy'),
            displayDate: format(nextDate, 'MMMM yyyy'),
            qty: +runningQty.toFixed(2),
            value: projValue,
            monthlyCost: rowMonthlyCost,
            dividend: projDividend,
            spent: runningSpent,
            income: runningIncome,
            monthlyIncome,
            type: 'Projected'
        });
        prevValue = projValue;
        prevDividend = projDividend;
    }

    let runningAdded = 0;
    const accumulatedAdded = projectionData.map((d, i) => {
        if (i === 0) return 0;
        runningAdded += d.monthlyCost;
        return runningAdded;
    });

    // Build historical monthly data points from actual purchases
    const monthlyMap = new Map<string, { qty: number; price: number; cost: number }>();
    for (const p of sortedPurchases) {
        const monthKey = format(new Date(p.date), 'MMM yyyy');
        const existing = monthlyMap.get(monthKey);
        if (existing) {
            existing.qty += p.quantity;
            existing.price = p.price;
            existing.cost += p.quantity * p.price;
        } else {
            monthlyMap.set(monthKey, { qty: p.quantity, price: p.price, cost: p.quantity * p.price });
        }
    }
    const historicalData: ProjectionDataPoint[] = [];
    let histRunningQty = 0;
    let histRunningSpent = 0;
    for (const [monthKey, data] of monthlyMap) {
        histRunningQty += data.qty;
        histRunningSpent += data.cost;
        const histValue = +(histRunningQty * data.price).toFixed(2);
        historicalData.push({
            date: monthKey,
            displayDate: monthKey,
            qty: +histRunningQty.toFixed(2),
            value: histValue,
            monthlyCost: data.cost,
            dividend: +(histValue * dividendPct / 12).toFixed(2),
            spent: +histRunningSpent.toFixed(2),
            income: 0,
            monthlyIncome: 0,
            type: 'Actual',
        });
    }
    // Prepend history (excluding last month, which is projectionData[0]) when toggled on
    const chartData = showHistory
        ? [...historicalData.slice(0, -1), ...projectionData]
        : projectionData;

    // Find first data point where dividend crosses each $1k milestone
    const targetIncomeHit = targetIncomeValue > 0
        ? projectionData.find(d => d.income >= targetIncomeValue) ?? null
        : null;
    const targetMonthlyIncomeHit = targetIncomeValue > 0
        ? projectionData.find(d => d.monthlyIncome >= targetIncomeValue) ?? null
        : null;

    const decayZeroHit = decay > 0 && monthlyStack > 0
        ? projectionData.find((d, i) => i > 0 && d.monthlyCost === 0 && projectionData[i - 1].monthlyCost > 0) ?? null
        : null;

    const maxDividend = Math.max(...projectionData.map(d => d.dividend));
    const milestoneStep = 1000;
    const milestones: { value: number; date: string }[] = [];
    for (let m = milestoneStep; m <= maxDividend; m += milestoneStep) {
        const hit = projectionData.find(d => d.dividend >= m);
        if (hit) milestones.push({ value: m, date: hit.date });
    }

    return (
        <>
        <section className="glass-card">
            <button
                onClick={() => setProjectionOpen(prev => !prev)}
                className="accordion-header"
            >
                <div className="flex items-center gap-2">
                    <PieChart className="text-accent-orange" size={24} />
                    <h2>{projMonths % 12 === 0 ? `${projMonths / 12} Year` : `${projMonths} Month`} Projection</h2>
                </div>
                {projectionOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {projectionOpen && <div className="space-y-8">
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 120px auto 120px', gap: '10px 24px', alignItems: 'center' }}>
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Monthly Stack (qty)</label>
                <input type="number" min="0" step="any" placeholder="qty" value={projectedMonthlyStack} onChange={e => setProjectedMonthlyStack(e.target.value)} className="input" />

                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Decay (months)</label>
                <input type="number" min="0" step="any" placeholder="months" value={decayMonths} onChange={e => setDecayMonths(e.target.value)} className="input" />

                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Stock Price</label>
                <input type="number" min="0" step="any" value={projectedCost} onChange={e => setProjectedCost(e.target.value)} className="input" />

                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Dividend (%)</label>
                <input type="number" min="0" step="any" value={dividendInput} onChange={e => setDividendInput(e.target.value)} className="input" />

                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Target Income ($)</label>
                <input type="number" min="0" step="any" placeholder="e.g. 5000" value={targetIncome} onChange={e => setTargetIncome(e.target.value)} className="input" />

                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Projection Length (months)</label>
                <input type="number" min="1" step="1" placeholder="months" value={projectionLength} onChange={e => setProjectionLength(e.target.value)} className="input" />

                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Taper Date
                    <button
                        onClick={() => setUseTaper(prev => !prev)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '2px 8px', borderRadius: '12px', fontSize: '10px',
                            fontWeight: 700, border: 'none', cursor: 'pointer',
                            background: useTaper ? 'var(--primary-purple)' : 'rgba(255,255,255,0.1)',
                            color: useTaper ? 'white' : 'var(--text-secondary)',
                            transition: 'all 0.2s',
                        }}
                    >
                        {useTaper ? 'ON' : 'OFF'}
                    </button>
                </label>
                <input type="month" value={taperDate} onChange={e => setTaperDate(e.target.value)} className="input" disabled={!useTaper} style={{ opacity: useTaper ? 1 : 0.35 }} />

                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide" style={{ opacity: useTaper ? 1 : 0.35 }}>Taper Length (months)</label>
                <input type="number" min="1" step="1" placeholder="months" value={taperLength} onChange={e => setTaperLength(e.target.value)} className="input" disabled={!useTaper} style={{ opacity: useTaper ? 1 : 0.35 }} />
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
                <table>
                    <thead className="sticky top-0 bg-card-bg z-10">
                        <tr>
                            <th>Month</th>
                            <th>Monthly Inv</th>
                            <th>Invested</th>
                            <th>Bought</th>
                            <th>Projected Value</th>
                            <th>Spent</th>
                            <th>DivQ</th>
                            <th>Dividend</th>
                            <th>ReInv</th>
                            <th>Income</th>
                            <th>Accrued</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projectionData.map((d, i) => {
                            const year = d.date.split(' ')[1];
                            const prevYear = i > 0 ? projectionData[i - 1].date.split(' ')[1] : null;
                            const isYearBoundary = i > 0 && year !== prevYear;
                            const isTargetRow = targetMonthlyIncomeHit && d.date === targetMonthlyIncomeHit.date;
                            const isFirstRow = i === 0;
                            return (
                            <tr key={i} style={{
                                ...(isTargetRow ? { backgroundColor: 'rgba(167, 139, 250, 0.18)', boxShadow: 'inset 0 0 0 1px rgba(167, 139, 250, 0.4)' }
                                    : isFirstRow ? { backgroundColor: 'rgba(74, 222, 128, 0.12)' } : {}),
                                ...(isYearBoundary ? { borderTop: '2px solid rgba(255,255,255,0.6)' } : {}),
                            }}>
                                <td>{d.displayDate}</td>
                                <td className="font-mono text-text-secondary">
                                    {d.monthlyCost > 0 ? `$${Math.trunc(d.monthlyCost).toLocaleString()}` : '—'}
                                </td>
                                <td className="font-mono text-accent-orange">
                                    {i === 0 ? '—' : `$${Math.trunc(accumulatedAdded[i]).toLocaleString()}`}
                                </td>
                                <td className="font-mono">{Math.trunc(d.qty).toLocaleString()}</td>
                                <td className="font-bold text-accent-green">${Math.trunc(d.value).toLocaleString()}</td>
                                <td className="font-mono text-accent-purple">${Math.trunc(d.spent).toLocaleString()}</td>
                                <td className="font-mono text-text-secondary">
                                    {d.type === 'Actual' ? '—' : monthlyCost > 0 ? ((d.dividend - d.monthlyIncome) / monthlyCost).toFixed(2) : '—'}
                                </td>
                                <td className="font-mono text-accent-blue">
                                    {d.type === 'Actual' ? '—' : `$${Math.trunc(d.dividend).toLocaleString()}`}
                                </td>
                                <td className="font-mono text-accent-blue">
                                    {d.type === 'Actual' ? '—' : `$${Math.trunc(d.dividend - d.monthlyIncome).toLocaleString()}`}
                                </td>
                                <td className="font-mono text-accent-green">
                                    {d.monthlyIncome > 0 ? `$${Math.trunc(d.monthlyIncome).toLocaleString()}` : '—'}
                                </td>
                                <td className="font-mono text-accent-orange">
                                    {d.income > 0 ? `$${Math.trunc(d.income).toLocaleString()}` : '—'}
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            </div>}
        </section>

        <section className="glass-card">
                <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="text-accent-orange" size={24} />
                    <h2>Projection Graph</h2>
                    <button
                        onClick={() => setShowHistory(prev => !prev)}
                        className="ml-auto text-xs px-3 py-1 rounded-full text-white transition-colors"
                        style={{ background: '#38bdf8' }}
                    >
                        {showHistory ? 'Hide History' : 'Show History'}
                    </button>
                </div>
                <div style={{ height: '300px', width: '100%', position: 'relative' }}>
                    <div style={{
                        position: 'absolute', top: 8, right: 88, zIndex: 10,
                        display: 'flex', flexDirection: 'column', gap: '6px',
                        background: 'rgba(17,19,31,0.7)', borderRadius: '8px', padding: '8px 12px',
                        backdropFilter: 'blur(6px)',
                    }}>
                        <div className="flex items-center gap-2">
                            <div style={{ width: '24px', height: '3px', background: 'var(--warning-orange)', borderRadius: '2px' }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Projected Value</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div style={{ width: '24px', height: '0', borderTop: '2px dashed var(--primary-purple)' }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total Spent</span>
                        </div>
                        {hasDividends && (
                        <div className="flex items-center gap-2">
                            <div style={{ width: '24px', height: '3px', background: 'var(--primary-blue)', borderRadius: '2px' }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Dividend (right axis)</span>
                        </div>
                        )}
                        {useTaper && taperDateLabel && (
                            <div className="flex items-center gap-2">
                                <div style={{ width: '24px', height: '0', borderTop: '2px dashed var(--accent-orange, #f97316)' }} />
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Taper Start</span>
                            </div>
                        )}
                        {targetIncomeHit && (
                            <div className="flex items-center gap-2">
                                <div style={{ width: '24px', height: '0', borderTop: '2px dashed #a78bfa' }} />
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Target Income</span>
                            </div>
                        )}
                        {decayZeroHit && (
                            <div className="flex items-center gap-2">
                                <div style={{ width: '24px', height: '0', borderTop: '2px dashed #6ee7b7' }} />
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Inv Decay End</span>
                            </div>
                        )}
                    </div>
                    {chartMounted && <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorProjValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--warning-orange)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--warning-orange)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorProjDiv" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--primary-blue)" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="var(--primary-blue)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="var(--text-secondary)"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                interval={5}
                            />
                            <YAxis
                                yAxisId="left"
                                stroke="var(--text-secondary)"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                            />
                            {hasDividends && (
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="var(--primary-blue)"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `$${value.toLocaleString()}`}
                            />
                            )}
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)', borderRadius: '8px' }}
                                itemStyle={{ color: 'var(--text-primary)' }}
                                formatter={(value, name) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, name]}
                                labelFormatter={(label) => {
                                    const point = chartData.find(d => d.date === label);
                                    return point ? point.displayDate : label;
                                }}
                            />
                            <Area
                                yAxisId="left"
                                type="monotone"
                                dataKey="value"
                                stroke="var(--warning-orange)"
                                fillOpacity={1}
                                fill="url(#colorProjValue)"
                                strokeWidth={3}
                                name="Projected Value"
                            />
                            <Area
                                yAxisId="left"
                                type="monotone"
                                dataKey="spent"
                                stroke="var(--primary-purple)"
                                fill="transparent"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                name="Total Spent"
                            />
                            {hasDividends && (
                            <Area
                                yAxisId="right"
                                type="monotone"
                                dataKey="dividend"
                                stroke="var(--primary-blue)"
                                fillOpacity={1}
                                fill="url(#colorProjDiv)"
                                strokeWidth={2}
                                name="Monthly Dividend"
                            />
                            )}
                            {hasDividends && milestones.map(m => (
                                <ReferenceLine
                                    key={m.value}
                                    x={m.date}
                                    yAxisId="left"
                                    stroke="var(--success-green)"
                                    strokeDasharray="4 3"
                                    strokeWidth={1.5}
                                    label={{
                                        value: `$${(m.value / 1000).toFixed(0)}k div`,
                                        position: 'insideTopRight',
                                        fontSize: 10,
                                        fill: 'var(--success-green)',
                                        offset: 6,
                                    }}
                                />
                            ))}
                            {useTaper && taperDateLabel && (
                                <ReferenceLine
                                    x={taperDateLabel}
                                    yAxisId="left"
                                    stroke="var(--accent-orange, #f97316)"
                                    strokeDasharray="6 3"
                                    strokeWidth={2}
                                    label={{
                                        value: 'Taper',
                                        position: 'insideTopLeft',
                                        fontSize: 10,
                                        fill: 'var(--accent-orange, #f97316)',
                                        offset: 6,
                                    }}
                                />
                            )}
                            {targetIncomeHit && (
                                <ReferenceLine
                                    x={targetIncomeHit.date}
                                    yAxisId="left"
                                    stroke="#a78bfa"
                                    strokeDasharray="6 3"
                                    strokeWidth={2}
                                    label={{
                                        value: `$${Math.trunc(targetIncomeValue).toLocaleString()} inc`,
                                        position: 'insideTopRight',
                                        fontSize: 10,
                                        fill: '#a78bfa',
                                        offset: 6,
                                    }}
                                />
                            )}
                            {decayZeroHit && (
                                <ReferenceLine
                                    x={decayZeroHit.date}
                                    yAxisId="left"
                                    stroke="#6ee7b7"
                                    strokeDasharray="6 3"
                                    strokeWidth={2}
                                    label={{
                                        value: 'Inv End',
                                        position: 'insideTopLeft',
                                        fontSize: 10,
                                        fill: '#6ee7b7',
                                        offset: 6,
                                    }}
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>}
                </div>
            </section>
        </>
    );
};

export default ProjectionView;
