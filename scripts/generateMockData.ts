import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fixed seed + fixed anchor date so re-running this script reproduces byte-identical
// output regardless of when it's run — the committed fixture should stay stable/diffable.
const SEED = 42;
const ANCHOR_DATE = new Date('2026-08-01T00:00:00Z');

function mulberry32(seed: number) {
    let s = seed;
    return function (): number {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const rng = mulberry32(SEED);

let cachedGaussian: number | null = null;
function nextGaussian(): number {
    if (cachedGaussian !== null) {
        const v = cachedGaussian;
        cachedGaussian = null;
        return v;
    }
    let u1 = 0;
    while (u1 === 0) u1 = rng();
    const u2 = rng();
    const mag = Math.sqrt(-2 * Math.log(u1));
    cachedGaussian = mag * Math.sin(2 * Math.PI * u2);
    return mag * Math.cos(2 * Math.PI * u2);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
}

function fmtDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round6(n: number): number { return Math.round(n * 1e6) / 1e6; }

type DivFreq = 'quarterly' | 'monthly' | null;

interface TickerDef {
    ticker: string;
    name: string;
    startPrice: number;
    annualDrift: number;
    annualVol: number;
    divFreq: DivFreq;
    annualDivPerShare: number;
}

// Real public tickers so live Yahoo Finance quotes/charts stay meaningful in mock mode —
// only the buy/sell/dividend history below is fabricated.
const TICKERS: TickerDef[] = [
    { ticker: 'AAPL', name: 'Apple Inc.', startPrice: 130, annualDrift: 0.18, annualVol: 0.32, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'MSFT', name: 'Microsoft Corporation', startPrice: 220, annualDrift: 0.16, annualVol: 0.28, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', startPrice: 95, annualDrift: 0.15, annualVol: 0.30, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'AMZN', name: 'Amazon.com, Inc.', startPrice: 140, annualDrift: 0.14, annualVol: 0.34, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'NVDA', name: 'NVIDIA Corporation', startPrice: 60, annualDrift: 0.45, annualVol: 0.55, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'META', name: 'Meta Platforms, Inc.', startPrice: 260, annualDrift: 0.20, annualVol: 0.40, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'TSLA', name: 'Tesla, Inc.', startPrice: 220, annualDrift: 0.10, annualVol: 0.55, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'CRM', name: 'Salesforce, Inc.', startPrice: 220, annualDrift: 0.10, annualVol: 0.32, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'JNJ', name: 'Johnson & Johnson', startPrice: 160, annualDrift: 0.05, annualVol: 0.16, divFreq: 'quarterly', annualDivPerShare: 4.50 },
    { ticker: 'PG', name: 'Procter & Gamble Co.', startPrice: 135, annualDrift: 0.06, annualVol: 0.15, divFreq: 'quarterly', annualDivPerShare: 3.65 },
    { ticker: 'KO', name: 'Coca-Cola Co.', startPrice: 55, annualDrift: 0.06, annualVol: 0.14, divFreq: 'quarterly', annualDivPerShare: 1.84 },
    { ticker: 'O', name: 'Realty Income Corp.', startPrice: 65, annualDrift: 0.04, annualVol: 0.15, divFreq: 'monthly', annualDivPerShare: 3.08 },
    { ticker: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', startPrice: 75, annualDrift: 0.08, annualVol: 0.14, divFreq: 'quarterly', annualDivPerShare: 2.60 },
    { ticker: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', startPrice: 55, annualDrift: 0.03, annualVol: 0.10, divFreq: 'monthly', annualDivPerShare: 5.50 },
    { ticker: 'VZ', name: 'Verizon Communications Inc.', startPrice: 55, annualDrift: 0.02, annualVol: 0.16, divFreq: 'quarterly', annualDivPerShare: 2.71 },
    { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', startPrice: 380, annualDrift: 0.11, annualVol: 0.15, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', startPrice: 210, annualDrift: 0.11, annualVol: 0.15, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'QQQ', name: 'Invesco QQQ Trust', startPrice: 340, annualDrift: 0.14, annualVol: 0.18, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'VYM', name: 'Vanguard High Dividend Yield ETF', startPrice: 105, annualDrift: 0.08, annualVol: 0.13, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'VICI', name: 'VICI Properties Inc.', startPrice: 30, annualDrift: 0.06, annualVol: 0.18, divFreq: 'quarterly', annualDivPerShare: 1.50 },
    { ticker: 'AMD', name: 'Advanced Micro Devices, Inc.', startPrice: 90, annualDrift: 0.20, annualVol: 0.45, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'COST', name: 'Costco Wholesale Corporation', startPrice: 380, annualDrift: 0.15, annualVol: 0.20, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'XOM', name: 'Exxon Mobil Corporation', startPrice: 60, annualDrift: 0.08, annualVol: 0.25, divFreq: null, annualDivPerShare: 0 },
    { ticker: 'DIS', name: 'The Walt Disney Company', startPrice: 175, annualDrift: 0.03, annualVol: 0.30, divFreq: null, annualDivPerShare: 0 },
];

interface WalkPoint { date: Date; price: number }

function generateWeeklyWalk(startDate: Date, endDate: Date, startPrice: number, annualDrift: number, annualVol: number): WalkPoint[] {
    const points: WalkPoint[] = [];
    let price = startPrice;
    let current = new Date(startDate);
    const weeklyDrift = annualDrift / 52;
    const weeklyVol = annualVol / Math.sqrt(52);
    while (current.getTime() <= endDate.getTime()) {
        points.push({ date: new Date(current), price });
        const shock = weeklyVol * nextGaussian();
        const step = weeklyDrift - 0.5 * weeklyVol * weeklyVol + shock;
        price = Math.max(1, price * Math.exp(step));
        current = addDays(current, 7);
    }
    return points;
}

function priceAt(walk: WalkPoint[], date: Date): number {
    let closest = walk[0];
    let closestDiff = Math.abs(date.getTime() - closest.date.getTime());
    for (const point of walk) {
        const diff = Math.abs(date.getTime() - point.date.getTime());
        if (diff < closestDiff) { closest = point; closestDiff = diff; }
    }
    return closest.price;
}

interface RawTransaction {
    id: number;
    date: string;
    price: number;
    quantity: number;
    ticker: string;
    type: 'BUY' | 'SELL' | 'MDIV';
}

interface MockStock {
    id: string;
    ticker: string;
    name: string;
    shortName: string;
    createdAt: string;
    description: string;
}

const allTransactions: RawTransaction[] = [];
const stocks: MockStock[] = [];

for (const def of TICKERS) {
    const startOffsetDays = Math.round((5 + rng() * 0.5) * 365.25);
    const startDate = addDays(ANCHOR_DATE, -startOffsetDays);
    const walk = generateWeeklyWalk(startDate, ANCHOR_DATE, def.startPrice, def.annualDrift, def.annualVol);

    const buys: RawTransaction[] = [];

    const initialCost = 500 + rng() * 2500;
    const initialPrice = priceAt(walk, startDate);
    buys.push({ id: 0, date: fmtDate(startDate), price: round2(initialPrice), quantity: round6(initialCost / initialPrice), ticker: def.ticker, type: 'BUY' });

    let cursor = addDays(startDate, 30 + Math.round((rng() - 0.5) * 10));
    while (cursor.getTime() <= ANCHOR_DATE.getTime()) {
        const cost = 100 + rng() * 400;
        const price = priceAt(walk, cursor);
        buys.push({ id: 0, date: fmtDate(cursor), price: round2(price), quantity: round6(cost / price), ticker: def.ticker, type: 'BUY' });
        cursor = addDays(cursor, 30 + Math.round((rng() - 0.5) * 10));
    }

    const sells: RawTransaction[] = [];
    if (rng() < 1 / 3) {
        const sellCount = 1 + Math.floor(rng() * 3);
        const eligibleStart = Math.floor(buys.length * 0.4);
        const chosenIndices = new Set<number>();
        for (let i = 0; i < sellCount; i++) {
            chosenIndices.add(eligibleStart + Math.floor(rng() * (buys.length - eligibleStart)));
        }
        const sortedIndices = Array.from(chosenIndices).sort((a, b) => a - b);
        let runningSold = 0;
        for (const idx of sortedIndices) {
            const sharesBoughtByIdx = buys.slice(0, idx + 1).reduce((sum, b) => sum + b.quantity, 0);
            const heldAtTrigger = sharesBoughtByIdx - runningSold;
            if (heldAtTrigger <= 0) continue;
            const sellFraction = 0.1 + rng() * 0.3;
            const sellQty = round6(heldAtTrigger * sellFraction);
            const sellDate = addDays(new Date(buys[idx].date), 2 + Math.floor(rng() * 5));
            const sellPrice = priceAt(walk, sellDate);
            sells.push({ id: 0, date: fmtDate(sellDate), price: round2(sellPrice), quantity: sellQty, ticker: def.ticker, type: 'SELL' });
            runningSold += sellQty;
        }
    }

    const dividends: RawTransaction[] = [];
    if (def.divFreq) {
        const intervalDays = def.divFreq === 'monthly' ? 30 : 91;
        const perPaymentRate = def.annualDivPerShare / (def.divFreq === 'monthly' ? 12 : 4);
        let divDate = addDays(startDate, intervalDays);
        while (divDate.getTime() <= ANCHOR_DATE.getTime()) {
            const divDateStr = fmtDate(divDate);
            const heldShares =
                buys.filter(b => b.date <= divDateStr).reduce((sum, b) => sum + b.quantity, 0) -
                sells.filter(s => s.date <= divDateStr).reduce((sum, s) => sum + s.quantity, 0);
            if (heldShares > 0) {
                const rateJitter = perPaymentRate * (0.9 + rng() * 0.2);
                const cash = round2(heldShares * rateJitter);
                if (cash > 0) {
                    dividends.push({ id: 0, date: divDateStr, price: cash, quantity: 1, ticker: def.ticker, type: 'MDIV' });
                }
            }
            divDate = addDays(divDate, intervalDays);
        }
    }

    allTransactions.push(...buys, ...sells, ...dividends);

    stocks.push({
        id: def.ticker,
        ticker: def.ticker,
        name: def.name,
        shortName: def.name,
        createdAt: fmtDate(startDate),
        description: '',
    });
}

allTransactions.sort((a, b) => a.date.localeCompare(b.date));
let nextId = 1;
for (const t of allTransactions) t.id = nextId++;

const outDir = path.join(__dirname, '..', 'data', 'mock');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'stocks.json'), JSON.stringify(stocks, null, 2));
fs.writeFileSync(path.join(outDir, 'transactions.json'), JSON.stringify(allTransactions, null, 2));
fs.writeFileSync(path.join(outDir, 'projection-settings.json'), JSON.stringify({}, null, 2));

console.log(`Generated ${stocks.length} stocks and ${allTransactions.length} transactions in ${outDir}`);
