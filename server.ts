import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5001;
const TRANSACTIONS_FILE = path.join(__dirname, 'data', 'transactions.json');
const STOCKS_FILE = path.join(__dirname, 'data', 'stocks.json');
const PROJECTION_SETTINGS_FILE = path.join(__dirname, 'data', 'projection-settings.json');
const SUMMARY_CACHE_FILE = path.join(__dirname, 'data', 'summary-cache.json');
const HISTORY_CACHE_FILE = path.join(__dirname, 'data', 'portfolio-history-cache.json');
const BENCHMARK_CACHE_FILE = path.join(__dirname, 'data', 'benchmark-cache.json');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Ensure the data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Ensure the transactions file exists
if (!fs.existsSync(TRANSACTIONS_FILE)) {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify([]));
}

// Seed stocks.json if it doesn't exist
if (!fs.existsSync(STOCKS_FILE)) {
    fs.writeFileSync(STOCKS_FILE, JSON.stringify([
        { id: 'STRC', ticker: 'STRC', name: 'Strategy Inc', createdAt: new Date().toISOString().split('T')[0] }
    ], null, 2));
}

// Seed projection-settings.json if it doesn't exist
if (!fs.existsSync(PROJECTION_SETTINGS_FILE)) {
    fs.writeFileSync(PROJECTION_SETTINGS_FILE, JSON.stringify({}));
}

function invalidateSummaryCache() {
    if (fs.existsSync(SUMMARY_CACHE_FILE)) fs.unlinkSync(SUMMARY_CACHE_FILE);
    if (fs.existsSync(HISTORY_CACHE_FILE)) fs.unlinkSync(HISTORY_CACHE_FILE);
    if (fs.existsSync(BENCHMARK_CACHE_FILE)) fs.unlinkSync(BENCHMARK_CACHE_FILE);
}

// GET transactions (optional ?ticker= filter)
app.get('/api/transactions', (req: Request, res: Response) => {
    const ticker = req.query.ticker as string | undefined;
    fs.readFile(TRANSACTIONS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading transactions file');
        let transactions = JSON.parse(data);
        if (ticker) {
            transactions = transactions.filter((t: { ticker?: string }) => t.ticker === ticker);
        }
        res.json(transactions);
    });
});

// POST transaction
app.post('/api/transactions', (req: Request, res: Response) => {
    const newTransaction = req.body;
    fs.readFile(TRANSACTIONS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading transactions file');
        const transactions = JSON.parse(data);
        transactions.push(newTransaction);
        fs.writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing transactions file');
            invalidateSummaryCache();
            res.status(201).json(newTransaction);
        });
    });
});

// POST bulk transactions (CSV import)
app.post('/api/transactions/bulk', (req: Request, res: Response) => {
    const newTransactions = req.body;
    if (!Array.isArray(newTransactions)) {
        return res.status(400).json({ error: 'Expected an array' });
    }
    fs.readFile(TRANSACTIONS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading transactions file');
        const transactions = JSON.parse(data);

        type TxnLike = { id: number; ticker: string; date: string; type: string; quantity: number; price: number };
        // Corporate-action types are identified purely by date+ticker+qty+price (type-agnostic).
        // This lets a re-import with corrected classification (e.g. MRGS_MERGER → SHARE_EXCHANGE_OUT)
        // replace the stale wrong-type entry rather than coexist alongside it.
        const CA_TYPES = new Set(['MRGS_MERGER','MRGC_MERGER','SHARE_EXCHANGE_OUT','SHARE_EXCHANGE','SPINOFF','REC','SPLIT','RETURN_OF_CAPITAL']);
        const strictKey  = (t: TxnLike) => `${t.ticker}::${t.date}::${t.type}::${t.quantity}::${Math.round((t.price ?? 0) * 1000)}`;
        const flexKey    = (t: TxnLike) => `${t.ticker}::${t.date}::CA::${t.quantity.toFixed(4)}::${Math.round((t.price ?? 0) * 1000)}`;
        const keyFor     = (t: TxnLike) => CA_TYPES.has(t.type) ? flexKey(t) : strictKey(t);

        // Map flex/strict key → existing transaction id(s)
        const existingByKey = new Map<string, number[]>();
        for (const t of transactions as TxnLike[]) {
            const k = keyFor(t);
            if (!existingByKey.has(k)) existingByKey.set(k, []);
            existingByKey.get(k)!.push(t.id);
        }

        const toDelete    = new Set<number>(); // existing IDs that will be replaced
        const seenNewKeys = new Set<string>(); // prevent inserting the same new key twice
        const inserted: TxnLike[] = [];
        let skipped = 0;

        for (const t of newTransactions as TxnLike[]) {
            const k = keyFor(t);
            if (seenNewKeys.has(k)) { skipped++; continue; }

            const existingIds = existingByKey.get(k);
            if (existingIds) {
                // Key already in DB. Check if it's an exact type match (true dup) or a reclassification.
                const allSameType = existingIds.every(id => {
                    const ex = (transactions as TxnLike[]).find(x => x.id === id);
                    return ex?.type === t.type;
                });
                if (allSameType) {
                    skipped++; // genuine duplicate — nothing to do
                } else {
                    // Type mismatch: stale entries from old import logic — replace with corrected one
                    existingIds.forEach(id => toDelete.add(id));
                    inserted.push(t);
                    seenNewKeys.add(k);
                    existingByKey.set(k, []); // mark as consumed
                }
            } else {
                inserted.push(t);
                seenNewKeys.add(k);
                existingByKey.set(k, []); // prevent duplicates within this batch
            }
        }

        const updated = [...(transactions as TxnLike[]).filter(t => !toDelete.has(t.id)), ...inserted];
        fs.writeFile(TRANSACTIONS_FILE, JSON.stringify(updated, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing transactions file');
            invalidateSummaryCache();
            res.status(201).json({ inserted, skipped });
        });
    });
});

// DELETE transaction by id
app.delete('/api/transactions/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    fs.readFile(TRANSACTIONS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading transactions file');
        let transactions: Array<{ id: string | number }> = JSON.parse(data);
        const originalLength = transactions.length;
        transactions = transactions.filter(t => String(t.id) !== String(id));
        if (transactions.length === originalLength) {
            return res.status(404).json({ error: 'Transaction not found', id });
        }
        fs.writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing transactions file');
            invalidateSummaryCache();
            res.status(200).json({ message: 'Transaction deleted', id });
        });
    });
});

// DELETE all transactions for a ticker
app.delete('/api/transactions', (req: Request, res: Response) => {
    const ticker = req.query.ticker as string | undefined;
    fs.readFile(TRANSACTIONS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading transactions file');
        let transactions: Array<{ ticker?: string }> = JSON.parse(data);
        const remaining = ticker ? transactions.filter(t => t.ticker !== ticker) : [];
        fs.writeFile(TRANSACTIONS_FILE, JSON.stringify(remaining, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing transactions file');
            invalidateSummaryCache();
            res.status(200).json({ message: 'Transactions deleted', ticker });
        });
    });
});

// GET stocks
app.get('/api/stocks', (_req: Request, res: Response) => {
    fs.readFile(STOCKS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading stocks file');
        res.json(JSON.parse(data));
    });
});

// POST stock (add new stock)
app.post('/api/stocks', (req: Request, res: Response) => {
    const newStock = req.body;
    fs.readFile(STOCKS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading stocks file');
        const stocks: Array<{ ticker: string }> = JSON.parse(data);
        if (stocks.some(s => s.ticker === newStock.ticker)) {
            return res.status(409).json({ error: 'Stock already exists' });
        }
        stocks.push(newStock);
        fs.writeFile(STOCKS_FILE, JSON.stringify(stocks, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing stocks file');
            res.status(201).json(newStock);
        });
    });
});

// POST bulk stocks (CSV import)
app.post('/api/stocks/bulk', (req: Request, res: Response) => {
    const newStocks: Array<{ ticker: string }> = req.body;
    if (!Array.isArray(newStocks)) return res.status(400).json({ error: 'Expected an array' });
    fs.readFile(STOCKS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading stocks file');
        const stocks: Array<{ ticker: string }> = JSON.parse(data);
        const existingTickers = new Set(stocks.map(s => s.ticker));
        const toAdd = newStocks.filter(s => !existingTickers.has(s.ticker));
        if (toAdd.length === 0) return res.status(200).json([]);
        const updated = [...stocks, ...toAdd];
        fs.writeFile(STOCKS_FILE, JSON.stringify(updated, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing stocks file');
            res.status(201).json(toAdd);
        });
    });
});

// DELETE stock (also removes all transactions for that ticker)
app.delete('/api/stocks/:ticker', (req: Request, res: Response) => {
    const ticker = req.params.ticker;
    fs.readFile(STOCKS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading stocks file');
        let stocks: Array<{ ticker: string }> = JSON.parse(data);
        const originalLength = stocks.length;
        stocks = stocks.filter(s => s.ticker !== ticker);
        if (stocks.length === originalLength) {
            return res.status(404).json({ error: 'Stock not found' });
        }
        fs.writeFile(STOCKS_FILE, JSON.stringify(stocks, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing stocks file');
            // Cascade: remove all transactions for this ticker
            fs.readFile(TRANSACTIONS_FILE, 'utf8', (tErr, tData) => {
                if (!tErr) {
                    const remaining = (JSON.parse(tData) as Array<{ ticker?: string }>).filter(t => t.ticker !== ticker);
                    fs.writeFile(TRANSACTIONS_FILE, JSON.stringify(remaining, null, 2), () => {});
                }
            });
            invalidateSummaryCache();
            res.status(200).json({ message: 'Stock deleted', ticker });
        });
    });
});

// DELETE all data (stocks + transactions)
app.delete('/api/all', (_req: Request, res: Response) => {
    fs.writeFile(STOCKS_FILE, JSON.stringify([], null, 2), (sErr) => {
        if (sErr) return res.status(500).send('Error clearing stocks file');
        fs.writeFile(TRANSACTIONS_FILE, JSON.stringify([], null, 2), (tErr) => {
            if (tErr) return res.status(500).send('Error clearing transactions file');
            invalidateSummaryCache();
            res.status(200).json({ message: 'All data deleted' });
        });
    });
});

// GET projection settings for a ticker
app.get('/api/projection-settings/:ticker', (req: Request, res: Response) => {
    const ticker = req.params.ticker;
    fs.readFile(PROJECTION_SETTINGS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading projection settings file');
        const all = JSON.parse(data);
        res.json(all[ticker] ?? {});
    });
});

// PUT projection settings for a ticker
app.put('/api/projection-settings/:ticker', (req: Request, res: Response) => {
    const ticker = req.params.ticker;
    const settings = req.body;
    fs.readFile(PROJECTION_SETTINGS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading projection settings file');
        const all = JSON.parse(data);
        all[ticker] = settings;
        fs.writeFile(PROJECTION_SETTINGS_FILE, JSON.stringify(all, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing projection settings file');
            res.status(200).json(settings);
        });
    });
});

// --- Live price proxy (yahoo-finance2) ---

// Maps bare crypto symbols to Yahoo Finance's expected format (e.g. BTC → BTC-USD)
const YF_CRYPTO_MAP: Record<string, string> = {
    BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', XRP: 'XRP-USD',
    DOGE: 'DOGE-USD', ADA: 'ADA-USD', AVAX: 'AVAX-USD', LINK: 'LINK-USD',
    LTC: 'LTC-USD', DOT: 'DOT-USD', MATIC: 'MATIC-USD',
};

function toYfTicker(ticker: string): string {
    return YF_CRYPTO_MAP[ticker.toUpperCase()] ?? ticker;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

app.get('/api/lookup/batch', async (req: Request, res: Response) => {
    const tickersParam = (req.query.tickers as string) || '';
    const tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean);
    if (tickers.length === 0) return res.json({});
    try {
        const yfTickers = tickers.map(toYfTicker);
        const batchQuotes = await withTimeout(
            yahooFinance.quote(yfTickers, { return: 'object' }, { validateResult: false }) as Promise<Record<string, Record<string, unknown>>>,
            10000
        );
        const result: Record<string, { name: string; shortName?: string }> = {};
        for (const ticker of tickers) {
            const q = batchQuotes[toYfTicker(ticker)];
            result[ticker] = {
                name: (q?.longName as string) || (q?.shortName as string) || ticker,
                shortName: (q?.shortName as string) || undefined,
            };
        }
        res.json(result);
    } catch {
        const fallback: Record<string, { name: string }> = {};
        for (const t of tickers) fallback[t] = { name: t };
        res.json(fallback);
    }
});

app.get('/api/lookup/:ticker', async (req: Request, res: Response) => {
    const { ticker } = req.params;
    const yfTicker = toYfTicker(ticker);
    try {
        const quote = await withTimeout(yahooFinance.quote(yfTicker), 8000);
        const q = quote as Record<string, unknown>;
        const name = q?.longName as string || q?.shortName as string || ticker;
        const shortName = q?.shortName as string || name;
        let description: string | undefined;
        try {
            const summary = await withTimeout(
                yahooFinance.quoteSummary(yfTicker, { modules: ['assetProfile'] }),
                8000
            );
            const profile = summary?.assetProfile as Record<string, unknown> | undefined;
            if (typeof profile?.longBusinessSummary === 'string' && profile.longBusinessSummary) {
                description = profile.longBusinessSummary;
            }
        } catch { /* no description available for this ticker type */ }
        res.json({ name, shortName, description });
    } catch {
        res.json({ name: ticker, shortName: ticker });
    }
});

// Serialise all PATCH writes through a promise chain to prevent concurrent read-modify-write corruption
let stocksWriteQueue: Promise<void> = Promise.resolve();

app.patch('/api/stocks/:ticker', (req: Request, res: Response) => {
    const ticker = req.params.ticker;
    const { name, shortName, description } = req.body as { name?: string; shortName?: string; description?: string };
    stocksWriteQueue = stocksWriteQueue.then(() => new Promise<void>((resolve) => {
        fs.readFile(STOCKS_FILE, 'utf8', (err, data) => {
            if (err) { res.status(500).send('Error reading stocks file'); resolve(); return; }
            const stocks: Array<{ ticker: string; name: string; shortName?: string; description?: string; createdAt?: string }> = JSON.parse(data);
            let stock = stocks.find(s => s.ticker === ticker);
            if (!stock) {
                // Auto-create stock entry if it has transactions but was never added to stocks.json
                stock = { ticker, name: name ?? ticker, createdAt: new Date().toISOString().split('T')[0] };
                stocks.push(stock);
            }
            if (name !== undefined) stock.name = name;
            if (shortName !== undefined) stock.shortName = shortName;
            if (description !== undefined) stock.description = description;
            fs.writeFile(STOCKS_FILE, JSON.stringify(stocks, null, 2), (writeErr) => {
                if (writeErr) { res.status(500).send('Error writing stocks file'); resolve(); return; }
                res.status(200).json(stock);
                resolve();
            });
        });
    }));
});

app.get('/api/price/chart/:ticker', async (req: Request, res: Response) => {
    const { ticker } = req.params;
    const period = (req.query.period as string) || '3m';
    const yfTicker = toYfTicker(ticker);

    const now = new Date();
    let period1: Date;
    let interval: '5m' | '30m' | '1d' | '1wk' | '1mo';

    switch (period) {
        case '1d':
            period1 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
            interval = '5m';
            break;
        case '1w':
            period1 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            interval = '30m';
            break;
        case '1m':
            period1 = new Date(now); period1.setMonth(now.getMonth() - 1);
            interval = '1d';
            break;
        case '3m':
            period1 = new Date(now); period1.setMonth(now.getMonth() - 3);
            interval = '1d';
            break;
        case 'ytd':
            period1 = new Date(now.getFullYear(), 0, 1);
            interval = '1d';
            break;
        case '1y':
            period1 = new Date(now); period1.setFullYear(now.getFullYear() - 1);
            interval = '1d';
            break;
        case '5y':
            period1 = new Date(now); period1.setFullYear(now.getFullYear() - 5);
            interval = '1wk';
            break;
        case 'max':
            period1 = new Date('1970-01-01');
            interval = '1mo';
            break;
        default:
            period1 = new Date(now); period1.setMonth(now.getMonth() - 3);
            interval = '1d';
    }

    try {
        const result = await withTimeout(
            yahooFinance.chart(yfTicker, { period1, period2: now, interval }),
            15000
        );
        const quotes = result?.quotes ?? [];
        const data = (quotes as Array<{ close?: number | null; date: Date }>)
            .filter(q => q.close != null)
            .map(q => ({ timestamp: q.date.getTime(), price: q.close as number }));
        res.json({ data });
    } catch (err: unknown) {
        console.error('[price/chart]', ticker, err);
        res.status(502).json({ error: 'Failed to fetch price history' });
    }
});

app.get('/api/price/:ticker', async (req: Request, res: Response) => {
    const { ticker } = req.params;
    const yfTicker = toYfTicker(ticker);

    const dbFallbackPrice = (): number | null => {
        try {
            const txns: Array<{ ticker: string; type: string; price: number; date: string }> =
                JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
            const recent = txns
                .filter(t => t.ticker === ticker && (t.type === 'BUY' || t.type === 'SELL' || t.type === 'purchase'))
                .sort((a, b) => b.date.localeCompare(a.date));
            return recent[0]?.price ?? null;
        } catch { return null; }
    };

    try {
        const quote = await yahooFinance.quote(yfTicker);
        const price = quote?.regularMarketPrice;
        if (price == null) {
            const fb = dbFallbackPrice();
            if (fb != null) return res.json({ price: fb });
            return res.status(404).json({ error: `Price not found for ${yfTicker}` });
        }
        res.json({ price });
    } catch (err: unknown) {
        console.error('[price]', ticker, err);
        const fb = dbFallbackPrice();
        if (fb != null) return res.json({ price: fb });
        res.status(502).json({ error: 'Failed to fetch live price' });
    }
});

// GET aggregated summary per ticker (shares, invested, estimated value, dividends)
app.post('/api/stocks/summary/refresh', (_req: Request, res: Response) => {
    invalidateSummaryCache();
    res.status(200).json({ message: 'Cache cleared' });
});

app.get('/api/stocks/summary', async (_req: Request, res: Response) => {
    if (fs.existsSync(SUMMARY_CACHE_FILE)) {
        try {
            const ageMs = Date.now() - fs.statSync(SUMMARY_CACHE_FILE).mtimeMs;
            if (ageMs < 15 * 60 * 1000) {
                const cached = JSON.parse(fs.readFileSync(SUMMARY_CACHE_FILE, 'utf8'));
                return res.json(cached);
            }
            fs.unlinkSync(SUMMARY_CACHE_FILE);
        } catch { /* fall through to recompute if cache is corrupt */ }
    }

    fs.readFile(TRANSACTIONS_FILE, 'utf8', async (err, data) => {
        if (err) return res.status(500).send('Error reading transactions file');
        let transactions: Array<{ ticker: string; type: string; price: number; quantity: number }>;
        try {
            transactions = JSON.parse(data);
        } catch {
            return res.status(500).send('Error parsing transactions file');
        }

        const currentYear = new Date().getFullYear().toString();
        const map: Record<string, { totalShares: number; totalBuyCost: number; totalSellProceeds: number; dividendIncome: number; ytdDividendIncome: number; slipIncome: number; ytdSlipIncome: number; brokerageFeeExpense: number; ytdBrokerageFeeExpense: number; marginInterestExpense: number; ytdMarginInterestExpense: number; marginCreditIncome: number; ytdMarginCreditIncome: number; rocIncome: number; ytdRocIncome: number; realizedPnL: number; ytdRealizedPnL: number; lastPrice: number; hasDividends: boolean; earliestPurchaseDate: string | null; lastSellDate: string | null; lastExchangeOutDate: string | null }> = {};
        // AVCO cost-basis tracking: runningShares/runningCost reflect held position after sells
        const cbTrack: Record<string, { runningShares: number; runningCost: number; monthly: Record<string, number>; yearly: Record<string, number> }> = {};

        // Must process chronologically so splits apply at the correct point
        const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Pre-collect SPINOFF signatures (ticker::date::qty4dp) for MRGS dedup [CORZ-style]
        const spinoffSigs = new Set<string>();
        for (const t of sorted) {
            if (t.type === 'SPINOFF') spinoffSigs.add(`${t.ticker}::${t.date}::${t.quantity.toFixed(4)}`);
        }
        // Per-ticker state for MRGS heuristics
        const preMergerQtyMap: Record<string, number> = {}; // "TICKER::DATE" → shares before first MRGS on that date [HUT-style]
        const mrgsNetReceived:  Record<string, number> = {}; // ticker → cumulative net MRGS qty added [CORZ^-style]

        // SHARE_EXCHANGE rows come from Robinhood's SXCH with blank price/amount.
        // Cost basis is inherited from the predecessor security that was exchanged out.
        // Match each SHARE_EXCHANGE with its corresponding SHARE_EXCHANGE_OUT by date + quantity,
        // then compute the predecessor's AVCO up to the exchange date.
        const exchangePriceLookup: Record<string, number> = {}; // "TICKER|YYYY-MM-DD" -> avg cost per share
        const outByKey = new Map<string, string>(); // "date|qty4dp" -> predecessor ticker
        for (const t of sorted) {
            if (t.type === 'SHARE_EXCHANGE_OUT') {
                outByKey.set(`${t.date}|${t.quantity.toFixed(4)}`, t.ticker);
            }
        }
        for (const t of sorted) {
            if (t.type === 'SHARE_EXCHANGE' && t.price === 0) {
                const predTicker = outByKey.get(`${t.date}|${t.quantity.toFixed(4)}`);
                if (!predTicker) continue;
                // Compute AVCO of predecessor up to (not including) the exchange
                let rShares = 0, rCost = 0;
                for (const u of sorted) {
                    if (u.ticker !== predTicker) continue;
                    if (u.date > t.date || (u.date === t.date && u.type === 'SHARE_EXCHANGE_OUT')) break;
                    if (u.type === 'BUY' || u.type === 'purchase' || u.type === 'REC' || u.type === 'MRGS_MERGER' || u.type === 'SPINOFF') {
                        rShares += u.quantity; rCost += u.price * u.quantity;
                    } else if (u.type === 'SELL') {
                        if (rShares > 0) { const avg = rCost / rShares; const sold = Math.min(u.quantity, rShares); rCost -= avg * sold; rShares = Math.max(0, rShares - u.quantity); }
                    } else if (u.type === 'SPLIT') {
                        rShares *= u.quantity;
                    }
                }
                if (rShares > 0) exchangePriceLookup[`${t.ticker}|${t.date}`] = rCost / rShares;
            }
        }

        for (const t of sorted) {
            if (!map[t.ticker]) {
                map[t.ticker] = { totalShares: 0, totalBuyCost: 0, totalSellProceeds: 0, realizedPnL: 0, ytdRealizedPnL: 0, dividendIncome: 0, ytdDividendIncome: 0, withheldTax: 0, ytdWithheldTax: 0, slipIncome: 0, ytdSlipIncome: 0, brokerageFeeExpense: 0, ytdBrokerageFeeExpense: 0, marginInterestExpense: 0, ytdMarginInterestExpense: 0, marginCreditIncome: 0, ytdMarginCreditIncome: 0, rocIncome: 0, ytdRocIncome: 0, lastPrice: 0, hasDividends: false, earliestPurchaseDate: null, lastSellDate: null, lastExchangeOutDate: null };
            }
            if (!cbTrack[t.ticker]) {
                cbTrack[t.ticker] = { runningShares: 0, runningCost: 0, monthly: {}, yearly: {} };
            }
            const s = map[t.ticker];
            const cb = cbTrack[t.ticker];
            const isBuy = t.type === 'BUY' || t.type === 'purchase';
            const isRec = t.type === 'REC' || t.type === 'MRGS_MERGER' || t.type === 'SPINOFF' || t.type === 'SHARE_EXCHANGE';
            const isSell = t.type === 'SELL';
            const isExchangeOut = t.type === 'SHARE_EXCHANGE_OUT';
            const isDividend = t.type === 'dividend' || t.type === 'MDIV' || t.type === 'CDIV';
            const isSlip = t.type === 'SLIP';
            const isDtax = t.type === 'DTAX';
            const isDfee = t.type === 'DFEE' || t.type === 'AFEE';
            const isMrgs = t.type === 'MRGS';
            const isMrgc = t.type === 'MRGC' || t.type === 'MRGC_MERGER';
            const isSplit = t.type === 'SPLIT';
            const isRoc = t.type === 'RETURN_OF_CAPITAL';
            if (isBuy) {
                s.totalShares += t.quantity; s.totalBuyCost += t.price * t.quantity; s.lastPrice = t.price;
                if (!s.earliestPurchaseDate || t.date < s.earliestPurchaseDate) s.earliestPurchaseDate = t.date;
                cb.runningCost += t.price * t.quantity;
                cb.runningShares += t.quantity;
            } else if (isRec) {
                // ── MRGS_MERGER heuristics ────────────────────────────────────────────────
                // Three patterns that produce incorrect DB entries via CSV import quirks.
                // Each is suppressed here so the calculation stays correct even when old
                // stale entries exist (a re-import with the fixed parser will also remove them).
                if (t.type === 'MRGS_MERGER') {
                    const mKey = `${t.ticker}::${t.date}`;
                    if (!(mKey in preMergerQtyMap)) preMergerQtyMap[mKey] = s.totalShares;
                    const preMerger = preMergerQtyMap[mKey];

                    // [HUT-style] qty ≈ pre-merger holding → this is the outgoing (removal) leg
                    if (preMerger > 0 && Math.abs(t.quantity - preMerger) / preMerger < 0.01) {
                        s.totalShares -= t.quantity;
                        s.lastExchangeOutDate = t.date as string;
                        if (cb.runningShares > 0) {
                            const avg = cb.runningCost / cb.runningShares;
                            cb.runningCost -= avg * Math.min(t.quantity, cb.runningShares);
                            cb.runningShares = Math.max(0, cb.runningShares - t.quantity);
                        }
                        continue; // handled — skip normal isRec path below
                    }
                    // [CORZ-style] a SPINOFF on the same date already counted these shares
                    if (spinoffSigs.has(`${t.ticker}::${t.date}::${t.quantity.toFixed(4)}`)) {
                        continue; // suppress duplicate
                    }
                    // [CORZ^-style] position was closed; qty matches prior total receipt → duplicate re-open
                    const prevReceived = mrgsNetReceived[t.ticker] ?? 0;
                    if (s.totalShares < 0.001 && prevReceived > 0 &&
                        Math.abs(t.quantity - prevReceived) / prevReceived < 0.01) {
                        continue; // suppress duplicate re-opening
                    }
                    // Normal MRGS_MERGER — record receipt and fall through to shared isRec logic
                    mrgsNetReceived[t.ticker] = (mrgsNetReceived[t.ticker] ?? 0) + t.quantity;
                }
                // ─────────────────────────────────────────────────────────────────────────
                const effectivePrice = (t.type === 'SHARE_EXCHANGE' && t.price === 0)
                    ? (exchangePriceLookup[`${t.ticker}|${t.date}`] ?? 0)
                    : t.price;
                s.totalShares += t.quantity; s.totalBuyCost += effectivePrice * t.quantity;
                if (!s.earliestPurchaseDate || t.date < s.earliestPurchaseDate) s.earliestPurchaseDate = t.date;
                cb.runningCost += effectivePrice * t.quantity;
                cb.runningShares += t.quantity;
            } else if (isSell) {
                s.totalShares -= t.quantity; s.totalSellProceeds += t.price * t.quantity; s.lastSellDate = t.date;
                // AVCO: cost-per-share unchanged; proportionally remove cost of sold shares
                if (cb.runningShares > 0) {
                    const avgPerShare = cb.runningCost / cb.runningShares;
                    const soldQty = Math.min(t.quantity, cb.runningShares);
                    const pnl = (t.price - avgPerShare) * soldQty;
                    s.realizedPnL += pnl;
                    if ((t.date as string).substring(0, 4) === currentYear) s.ytdRealizedPnL += pnl;
                    cb.runningCost -= avgPerShare * soldQty;
                    cb.runningShares = Math.max(0, cb.runningShares - t.quantity);
                }
            } else if (isDividend) {
                const amount = t.price * t.quantity;
                s.dividendIncome += amount; s.hasDividends = true;
                if ((t.date as string).substring(0, 4) === currentYear) s.ytdDividendIncome += amount;
            } else if (isSlip) {
                const slipAmount = t.price * t.quantity;
                s.slipIncome += slipAmount;
                if ((t.date as string).substring(0, 4) === currentYear) s.ytdSlipIncome += slipAmount;
            } else if (isDtax) {
                const taxAmount = Math.abs(t.price * t.quantity);
                s.withheldTax += taxAmount;
                if ((t.date as string).substring(0, 4) === currentYear) s.ytdWithheldTax += taxAmount;
            } else if (isDfee) {
                const feeAmount = Math.abs(t.price * t.quantity);
                s.brokerageFeeExpense += feeAmount;
                if ((t.date as string).substring(0, 4) === currentYear) s.ytdBrokerageFeeExpense += feeAmount;
            } else if (isMrgs) {
                const amount = Math.abs(t.price * t.quantity);
                s.marginInterestExpense += amount;
                if ((t.date as string).substring(0, 4) === currentYear) s.ytdMarginInterestExpense += amount;
            } else if (isMrgc) {
                const amount = Math.abs(t.price * t.quantity);
                s.marginCreditIncome += amount;
                if ((t.date as string).substring(0, 4) === currentYear) s.ytdMarginCreditIncome += amount;
            } else if (isSplit) {
                s.totalShares *= t.quantity; if (s.lastPrice > 0) s.lastPrice /= t.quantity;
                // Split multiplies shares; total cost basis is unchanged, so avg cost adjusts
                cb.runningShares *= t.quantity;
            } else if (isExchangeOut) {
                // Shares removed via security exchange — no cash proceeds, no realized PnL
                s.totalShares -= t.quantity;
                s.lastExchangeOutDate = t.date;
                if (cb.runningShares > 0) {
                    const avgPerShare = cb.runningCost / cb.runningShares;
                    const removedQty = Math.min(t.quantity, cb.runningShares);
                    cb.runningCost -= avgPerShare * removedQty;
                    cb.runningShares = Math.max(0, cb.runningShares - t.quantity);
                }
            } else if (isRoc) {
                // Return of capital: record cash received and reduce cost basis by that amount
                const amount = t.price * t.quantity;
                s.rocIncome += amount;
                if ((t.date as string).substring(0, 4) === currentYear) s.ytdRocIncome += amount;
                // Reduce running cost basis (ROC returns invested capital, not income)
                cb.runningCost = Math.max(0, cb.runningCost - amount);
            }

            // Snapshot avg cost per share at end of this transaction's month and year
            if (cb.runningShares > 0) {
                const avg = +(cb.runningCost / cb.runningShares).toFixed(4);
                const month = (t.date as string).substring(0, 7); // "YYYY-MM"
                const year  = (t.date as string).substring(0, 4); // "YYYY"
                cb.monthly[month] = avg;
                cb.yearly[year]   = avg;
            }
        }

        // Fetch live prices for all tickers in a single batch request
        const livePrices: Record<string, number> = {};
        try {
            const allTickers = Object.keys(map);
            const yfTickers = allTickers.map(toYfTicker);
            const batchQuotes = await withTimeout(
                yahooFinance.quote(yfTickers, { return: 'object' }, { validateResult: false }) as Promise<Record<string, { regularMarketPrice?: number }>>,
                12000
            );
            for (const ticker of allTickers) {
                const q = batchQuotes[toYfTicker(ticker)];
                if (q?.regularMarketPrice != null) livePrices[ticker] = q.regularMarketPrice;
            }
        } catch { /* fall back to last purchase prices — do not cache this result */ }

        const result: Record<string, { totalShares: number; totalInvested: number; sellProceeds: number; realizedPnL: number; ytdRealizedPnL: number; dividendIncome: number; ytdDividendIncome: number; withheldTax: number; ytdWithheldTax: number; slipIncome: number; ytdSlipIncome: number; brokerageFeeExpense: number; ytdBrokerageFeeExpense: number; marginInterestExpense: number; ytdMarginInterestExpense: number; marginCreditIncome: number; ytdMarginCreditIncome: number; rocIncome: number; ytdRocIncome: number; marketValue: number; totalReturn: number; hasDividends: boolean; costBasis: { monthly: Record<string, number>; yearly: Record<string, number>; total: number }; earliestPurchaseDate: string | null; closedDate: string | null; rating: number | null; absoluteRating: number | null; stockType: 'income' | 'growth' | 'balanced' | null }> = {};
        for (const [ticker, s] of Object.entries(map)) {
            // Clamp near-zero residuals to exactly 0 — rounding noise from split ratios,
            // truncated CSV quantities, or merger share conversions can leave a sub-cent
            // ghost position (e.g. 1.5e-05 shares) that falsely marks the position active.
            // Anything under 0.001 shares (~$0.01 at typical prices) is treated as closed.
            if (s.totalShares > 0 && s.totalShares < 0.001) s.totalShares = 0;

            const price = livePrices[ticker] ?? s.lastPrice;
            const netInvested = s.totalBuyCost - s.totalSellProceeds;
            const marketValue = +(s.totalShares * price).toFixed(2);
            const cb = cbTrack[ticker] ?? { runningShares: 0, runningCost: 0, monthly: {}, yearly: {} };
            const cbTotal = cb.runningShares > 0 ? +(cb.runningCost / cb.runningShares).toFixed(4) : 0;
            result[ticker] = {
                totalShares: +(s.totalShares.toFixed(6)),
                totalInvested: +(s.totalBuyCost.toFixed(2)),
                sellProceeds: +(s.totalSellProceeds.toFixed(2)),
                realizedPnL: +(s.realizedPnL.toFixed(2)),
                ytdRealizedPnL: +(s.ytdRealizedPnL.toFixed(2)),
                dividendIncome: +(s.dividendIncome.toFixed(2)),
                ytdDividendIncome: +(s.ytdDividendIncome.toFixed(2)),
                withheldTax: +(s.withheldTax.toFixed(2)),
                ytdWithheldTax: +(s.ytdWithheldTax.toFixed(2)),
                slipIncome: +(s.slipIncome.toFixed(2)),
                ytdSlipIncome: +(s.ytdSlipIncome.toFixed(2)),
                brokerageFeeExpense: +(s.brokerageFeeExpense.toFixed(2)),
                ytdBrokerageFeeExpense: +(s.ytdBrokerageFeeExpense.toFixed(2)),
                marginInterestExpense: +(s.marginInterestExpense.toFixed(2)),
                ytdMarginInterestExpense: +(s.ytdMarginInterestExpense.toFixed(2)),
                marginCreditIncome: +(s.marginCreditIncome.toFixed(2)),
                ytdMarginCreditIncome: +(s.ytdMarginCreditIncome.toFixed(2)),
                rocIncome: +(s.rocIncome.toFixed(2)),
                ytdRocIncome: +(s.ytdRocIncome.toFixed(2)),
                marketValue,
                totalReturn: +(marketValue + s.dividendIncome + s.slipIncome + s.marginCreditIncome + s.rocIncome - s.withheldTax - s.brokerageFeeExpense - s.marginInterestExpense - netInvested).toFixed(2),
                hasDividends: s.hasDividends,
                costBasis: { monthly: cb.monthly, yearly: cb.yearly, total: cbTotal },
                earliestPurchaseDate: s.earliestPurchaseDate,
                closedDate: s.totalShares < 0.000001 ? (s.lastSellDate || s.lastExchangeOutDate) : null,
                rating: null,
                absoluteRating: null,
                stockType: null,
            };
        }

        // Normalize rating 1–10 across active stocks (totalShares > 0, marketValue > 1000)
        const eligibleEntries = Object.entries(result).filter(
            ([, s]) => s.totalShares > 0 && s.marketValue > 1000 && s.totalInvested > 0
        );
        const returnPcts = eligibleEntries.map(([, s]) => (s.totalReturn / s.totalInvested) * 100);
        const minPct = Math.min(...returnPcts);
        const maxPct = Math.max(...returnPcts);
        const range = maxPct - minPct;
        for (const [ticker, s] of Object.entries(result)) {
            const returnPct = s.totalInvested > 0 ? (s.totalReturn / s.totalInvested) * 100 : 0;
            if (eligibleEntries.length === 1 && eligibleEntries[0][0] === ticker) {
                s.rating = 10;
            } else if (range > 0 && eligibleEntries.some(([t]) => t === ticker)) {
                s.rating = +((1 + ((returnPct - minPct) / range) * 9).toFixed(1));
            }
        }

        // Absolute rating — type-aware, independent of other portfolio holdings
        const today = new Date();
        for (const [, s] of Object.entries(result)) {
            if (s.totalShares <= 0 || s.totalInvested <= 0 || !s.earliestPurchaseDate) continue;

            const yearsHeld = Math.max(
                (today.getTime() - new Date(s.earliestPurchaseDate).getTime()) / (365.25 * 24 * 3600 * 1000),
                1 / 12
            );

            // Price appreciation only (excludes dividends, slip, margin, etc.)
            const priceGain = s.totalReturn - s.dividendIncome - s.slipIncome - s.marginCreditIncome - s.rocIncome
                + s.withheldTax + s.brokerageFeeExpense + s.marginInterestExpense;

            const annualDividends = s.dividendIncome / yearsHeld;
            const annualPriceGain = priceGain / yearsHeld;

            // Classify by what fraction of positive return comes from dividends
            const positiveReturn = annualDividends + Math.max(0, annualPriceGain);
            const dividendRatio = positiveReturn > 0 ? annualDividends / positiveReturn : (annualDividends > 0 ? 1 : 0);

            let absRating: number;

            if (dividendRatio > 0.65) {
                // Income type: rated on annualised dividend yield on cost basis
                s.stockType = 'income';
                const yieldPct = (annualDividends / s.totalInvested) * 100;
                const baseRating = Math.min(10, Math.max(1, 1 + (yieldPct / 13) * 9));

                // Penalty for price drift > 10% from cost basis
                const costPerShare = s.totalInvested / s.totalShares;
                const currentPrice = s.marketValue / s.totalShares;
                const priceDev = Math.abs(currentPrice - costPerShare) / costPerShare;
                const penalty = Math.max(0, (priceDev - 0.10) * 20);

                absRating = Math.max(1, baseRating - penalty);
            } else if (dividendRatio < 0.25) {
                // Growth type: rated on annualised price appreciation
                s.stockType = 'growth';
                const annualGainPct = (annualPriceGain / s.totalInvested) * 100;
                absRating = Math.min(10, Math.max(1, 1 + (annualGainPct / 20) * 9));
            } else {
                // Balanced: rated on annualised total return (gain + dividends)
                s.stockType = 'balanced';
                const annualTotalPct = ((annualDividends + annualPriceGain) / s.totalInvested) * 100;
                absRating = Math.min(10, Math.max(1, 1 + (annualTotalPct / 20) * 9));
            }

            s.absoluteRating = +absRating.toFixed(1);
        }

        if (Object.keys(livePrices).length > 0) {
            try { fs.writeFileSync(SUMMARY_CACHE_FILE, JSON.stringify(result, null, 2)); } catch { /* ignore write errors */ }
        }
        res.json(result);
    });
});

// Tickers that pay on a monthly schedule — dividends are plotted at actual amounts, never spread.
// For these tickers, a payment dated the 1st or 2nd of a month is attributed to the prior month
// (e.g. STRC's June 1st payment counts as May's dividend).
const KNOWN_MONTHLY_PAYERS = new Set(['SATA', 'STRC']);

// Don't show the current month in charts until at least 14 days have passed — a single day of
// data makes bar/line charts collapse visually. Returns YYYY-MM of the last chartable month.
function chartEndMonth(): string {
    const today = new Date();
    const day = today.getDate();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    if (day >= 14) return `${y}-${String(m).padStart(2, '0')}`;
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function effectiveDividendMonth(date: string, ticker: string): string {
    const raw = date.substring(0, 7);
    if (!KNOWN_MONTHLY_PAYERS.has(ticker)) return raw;
    const day = parseInt(date.substring(8, 10), 10);
    if (day > 2) return raw;
    const [y, m] = raw.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// GET synthetic monthly dividend income (for charting).
// Monthly payers (>=75% of available months paid): use actual per-month amounts.
// Non-monthly payers (quarterly, annual, sporadic): spread each year's total evenly
// across all months of that year so spikes are smoothed into a steady growth line.
app.get('/api/portfolio/monthly-dividends', (_req: Request, res: Response) => {
    let transactions: Array<{ ticker: string; type: string; price: number; quantity: number; date: string }>;
    try {
        transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
    } catch {
        return res.status(500).send('Error reading transactions file');
    }

    const divTypes = new Set(['MDIV', 'CDIV', 'dividend', 'RETURN_OF_CAPITAL']);
    const divTxns = transactions.filter(t => divTypes.has(t.type));
    if (divTxns.length === 0) return res.json([]);

    // Build full month range: first dividend month → today
    const sorted = [...divTxns].sort((a, b) => a.date.localeCompare(b.date));
    const firstMonth = sorted[0].date.substring(0, 7);
    const todayStr = chartEndMonth();
    const allMonths: string[] = [];
    {
        let cur = firstMonth;
        while (cur <= todayStr) {
            allMonths.push(cur);
            const [y, m] = cur.split('-').map(Number);
            cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
        }
    }

    // Group dividends: ticker → year → month → amount
    const tickerYearMap: Record<string, Record<string, Record<string, number>>> = {};
    for (const t of divTxns) {
        const month = effectiveDividendMonth(t.date, t.ticker);
        const year = month.substring(0, 4);
        if (!tickerYearMap[t.ticker]) tickerYearMap[t.ticker] = {};
        if (!tickerYearMap[t.ticker][year]) tickerYearMap[t.ticker][year] = {};
        const prev = tickerYearMap[t.ticker][year][month] ?? 0;
        tickerYearMap[t.ticker][year][month] = +(prev + t.price * t.quantity).toFixed(2);
    }

    // Accumulate into result
    const result: Record<string, number> = {};
    for (const m of allMonths) result[m] = 0;

    for (const [ticker, yearMap] of Object.entries(tickerYearMap)) {
        for (const [year, monthMap] of Object.entries(yearMap)) {
            const payMonths = Object.keys(monthMap).sort();
            const yearMonths = allMonths.filter(m => m.startsWith(year + '-'));

            // Available months in this year from first payment onward
            const firstPay = payMonths[0];
            const availableMonths = yearMonths.filter(m => m >= firstPay);
            const isMonthly = KNOWN_MONTHLY_PAYERS.has(ticker) ||
                (availableMonths.length > 0 && (payMonths.length / availableMonths.length) >= 0.75);

            if (isMonthly) {
                // Use actual amounts; months with no payment contribute 0
                for (const m of payMonths) {
                    if (result[m] !== undefined) result[m] = +(result[m] + monthMap[m]).toFixed(4);
                }
            } else {
                // Spread annual total evenly across 12 months (always use 12, not yearMonths.length,
                // so partial years — e.g. the current year — don't inflate the per-month value)
                const annualTotal = Object.values(monthMap).reduce((a, b) => a + b, 0);
                const perMonth = annualTotal / 12;
                for (const m of yearMonths) {
                    result[m] = +(result[m] + perMonth).toFixed(4);
                }
            }
        }
    }

    const output = allMonths.map(m => ({ month: m, dividends: +result[m].toFixed(2) }));
    res.json(output);
});

// GET per-ticker smoothed monthly dividend income.
// Same spreading rules as the aggregate endpoint: monthly payers (SATA, or >=75% months paid)
// get actual amounts; all others get annual total / 12 spread evenly across every month of that year.
// Each row: { month, [ticker]: number, ..., total: number }
app.get('/api/portfolio/monthly-dividends-by-ticker', (_req: Request, res: Response) => {
    let transactions: Array<{ ticker: string; type: string; price: number; quantity: number; date: string }>;
    try {
        transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
    } catch {
        return res.status(500).send('Error reading transactions file');
    }

    const divTypes = new Set(['MDIV', 'CDIV', 'dividend', 'RETURN_OF_CAPITAL']);
    const divTxns = transactions.filter(t => divTypes.has(t.type));
    if (divTxns.length === 0) return res.json([]);

    const sorted = [...divTxns].sort((a, b) => a.date.localeCompare(b.date));
    const firstMonth = sorted[0].date.substring(0, 7);
    const todayStr = chartEndMonth();
    const allMonths: string[] = [];
    {
        let cur = firstMonth;
        while (cur <= todayStr) {
            allMonths.push(cur);
            const [y, m] = cur.split('-').map(Number);
            cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
        }
    }

    // ticker → year → month → raw amount
    const tickerYearMap: Record<string, Record<string, Record<string, number>>> = {};
    for (const t of divTxns) {
        const month = effectiveDividendMonth(t.date, t.ticker);
        const year = month.substring(0, 4);
        if (!tickerYearMap[t.ticker]) tickerYearMap[t.ticker] = {};
        if (!tickerYearMap[t.ticker][year]) tickerYearMap[t.ticker][year] = {};
        const prev = tickerYearMap[t.ticker][year][month] ?? 0;
        tickerYearMap[t.ticker][year][month] = +(prev + t.price * t.quantity).toFixed(2);
    }

    const tickerResult: Record<string, Record<string, number>> = {};
    const totalResult: Record<string, number> = {};
    for (const m of allMonths) totalResult[m] = 0;

    for (const [ticker, yearMap] of Object.entries(tickerYearMap)) {
        if (!tickerResult[ticker]) {
            tickerResult[ticker] = {};
            for (const m of allMonths) tickerResult[ticker][m] = 0;
        }
        for (const [year, monthMap] of Object.entries(yearMap)) {
            const payMonths = Object.keys(monthMap).sort();
            const yearMonths = allMonths.filter(m => m.startsWith(year + '-'));
            const firstPay = payMonths[0];
            const availableMonths = yearMonths.filter(m => m >= firstPay);
            const isMonthly = KNOWN_MONTHLY_PAYERS.has(ticker) ||
                (availableMonths.length > 0 && (payMonths.length / availableMonths.length) >= 0.75);

            if (isMonthly) {
                for (const m of payMonths) {
                    tickerResult[ticker][m] = +((tickerResult[ticker][m] ?? 0) + monthMap[m]).toFixed(4);
                    totalResult[m] = +((totalResult[m] ?? 0) + monthMap[m]).toFixed(4);
                }
            } else {
                // Always divide by 12 so partial years (e.g. current year) don't inflate values
                const annualTotal = Object.values(monthMap).reduce((a, b) => a + b, 0);
                const perMonth = annualTotal / 12;
                for (const m of yearMonths) {
                    tickerResult[ticker][m] = +((tickerResult[ticker][m] ?? 0) + perMonth).toFixed(4);
                    totalResult[m] = +((totalResult[m] ?? 0) + perMonth).toFixed(4);
                }
            }
        }
    }

    const output = allMonths.map(m => {
        const row: Record<string, number | string> = { month: m };
        for (const [ticker, monthlyData] of Object.entries(tickerResult)) {
            const val = +monthlyData[m].toFixed(2);
            // Omit zero months so connectNulls bridges gaps rather than dipping to $0
            if (val > 0) row[ticker] = val;
        }
        row.total = +totalResult[m].toFixed(2);
        return row;
    });

    res.json(output);
});

// GET monthly portfolio value history (for charting)
app.get('/api/portfolio/monthly-value', async (_req: Request, res: Response) => {
    if (fs.existsSync(HISTORY_CACHE_FILE)) {
        try {
            const cached = JSON.parse(fs.readFileSync(HISTORY_CACHE_FILE, 'utf8'));
            return res.json(cached);
        } catch { /* fall through */ }
    }

    let transactions: Array<{ ticker: string; type: string; price: number; quantity: number; date: string }>;
    try {
        transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
    } catch {
        return res.status(500).send('Error reading transactions file');
    }
    if (transactions.length === 0) return res.json([]);

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    // Build month range from first transaction to today
    const firstMonth = sorted[0].date.substring(0, 7);
    const todayStr = chartEndMonth();
    const months: string[] = [];
    {
        let cur = firstMonth;
        while (cur <= todayStr) {
            months.push(cur);
            const [y, m] = cur.split('-').map(Number);
            const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
            cur = next;
        }
    }

    // Running state per ticker
    const runningShares: Record<string, number> = {};
    const runningCost: Record<string, number> = {};
    // snapshot at end of each month
    const monthlyShares: Record<string, Record<string, number>> = {}; // month -> ticker -> shares
    let txIdx = 0;

    for (const month of months) {
        while (txIdx < sorted.length && sorted[txIdx].date.substring(0, 7) <= month) {
            const t = sorted[txIdx++];
            if (!runningShares[t.ticker]) { runningShares[t.ticker] = 0; runningCost[t.ticker] = 0; }
            const isBuy = t.type === 'BUY' || t.type === 'purchase' || t.type === 'REC' || t.type === 'MRGS_MERGER' || t.type === 'SPINOFF' || t.type === 'SHARE_EXCHANGE';
            const isSell = t.type === 'SELL' || t.type === 'SHARE_EXCHANGE_OUT';
            const isSplit = t.type === 'SPLIT';
            if (isBuy) { runningShares[t.ticker] += t.quantity; runningCost[t.ticker] += t.price * t.quantity; }
            else if (isSell) { runningShares[t.ticker] = Math.max(0, runningShares[t.ticker] - t.quantity); }
            else if (isSplit) { runningShares[t.ticker] *= t.quantity; }
        }
        monthlyShares[month] = Object.fromEntries(
            Object.entries(runningShares).filter(([, s]) => s > 0.0001).map(([t, s]) => [t, +s.toFixed(6)])
        );
    }

    // Cumulative invested and dividends per month
    const cumInvested: Record<string, number> = {};
    const cumDividends: Record<string, number> = {};
    let runInvested = 0, runDividends = 0;
    txIdx = 0;
    for (const month of months) {
        while (txIdx < sorted.length && sorted[txIdx].date.substring(0, 7) <= month) {
            const t = sorted[txIdx++];
            const isBuy = t.type === 'BUY' || t.type === 'purchase' || t.type === 'REC' || t.type === 'MRGS_MERGER' || t.type === 'SPINOFF' || t.type === 'SHARE_EXCHANGE';
            const isSell = t.type === 'SELL';
            const isDividend = t.type === 'MDIV' || t.type === 'CDIV' || t.type === 'dividend';
            if (isBuy) runInvested += t.price * t.quantity;
            if (isSell) runInvested -= t.price * t.quantity;
            if (isDividend) runDividends += t.price * t.quantity;
        }
        cumInvested[month] = +runInvested.toFixed(2);
        cumDividends[month] = +runDividends.toFixed(2);
    }

    // Fetch historical monthly prices for all tickers ever held
    const allTickers = Object.keys(runningShares);
    const historicalPrices: Record<string, Record<string, number>> = {}; // ticker -> "YYYY-MM" -> price
    const period1 = new Date(`${firstMonth}-01`);
    const period2 = new Date();
    for (const ticker of allTickers) {
        historicalPrices[ticker] = {};
        try {
            const hist = await withTimeout(
                yahooFinance.chart(toYfTicker(ticker), { period1, period2, interval: '1mo' }),
                15000
            );
            for (const row of hist.quotes) {
                const m = row.date.toISOString().substring(0, 7);
                const price = row.adjclose ?? row.close;
                if (typeof price === 'number' && price > 0) historicalPrices[ticker][m] = price;
            }
        } catch { /* no history available — will fall back to last known */ }
    }

    // Build result: for each month compute total portfolio value
    const result: Array<{ month: string; totalValue: number; totalInvested: number; totalDividends: number }> = [];
    const lastKnownPrice: Record<string, number> = {};
    for (const month of months) {
        const sharesThisMonth = monthlyShares[month] ?? {};
        let totalValue = 0;
        for (const [ticker, shares] of Object.entries(sharesThisMonth)) {
            const price = historicalPrices[ticker]?.[month] ?? lastKnownPrice[ticker] ?? 0;
            if (price > 0) lastKnownPrice[ticker] = price;
            totalValue += shares * price;
        }
        // Update lastKnownPrice for tickers that have data this month
        for (const ticker of allTickers) {
            if (historicalPrices[ticker]?.[month]) lastKnownPrice[ticker] = historicalPrices[ticker][month];
        }
        result.push({ month, totalValue: +totalValue.toFixed(2), totalInvested: cumInvested[month] ?? 0, totalDividends: cumDividends[month] ?? 0 });
    }

    try { fs.writeFileSync(HISTORY_CACHE_FILE, JSON.stringify(result, null, 2)); } catch { /* ignore */ }
    res.json(result);
});

// GET monthly portfolio Ann% vs SPY Ann% vs Nasdaq (QQQ) Ann% for benchmark comparison chart
app.get('/api/portfolio/benchmark', async (_req: Request, res: Response) => {
    if (fs.existsSync(BENCHMARK_CACHE_FILE)) {
        try {
            return res.json(JSON.parse(fs.readFileSync(BENCHMARK_CACHE_FILE, 'utf8')));
        } catch { /* fall through and rebuild */ }
    }

    if (!fs.existsSync(HISTORY_CACHE_FILE)) return res.json([]);
    let history: Array<{ month: string; totalValue: number; totalInvested: number; totalDividends: number }>;
    try {
        history = JSON.parse(fs.readFileSync(HISTORY_CACHE_FILE, 'utf8'));
    } catch { return res.json([]); }
    if (history.length < 2) return res.json([]);

    // First month that has any invested capital
    const startEntry = history.find(h => h.totalInvested > 0);
    if (!startEntry) return res.json([]);
    const startMonth = startEntry.month;
    const [sy, sm] = startMonth.split('-').map(Number);
    const startMonthNum = sy * 12 + sm;

    // Fetch SPY and QQQ adjusted monthly closes from portfolio start to today
    const spyPrices: Record<string, number> = {};
    const nasdaqPrices: Record<string, number> = {};
    try {
        const [spyHist, nasdaqHist] = await Promise.all([
            withTimeout(
                yahooFinance.chart('SPY', { period1: new Date(`${startMonth}-01`), period2: new Date(), interval: '1mo' }),
                12000
            ),
            withTimeout(
                yahooFinance.chart('QQQ', { period1: new Date(`${startMonth}-01`), period2: new Date(), interval: '1mo' }),
                12000
            ),
        ]);
        for (const row of spyHist.quotes) {
            const m = row.date.toISOString().substring(0, 7);
            const price = row.adjclose ?? row.close;
            if (typeof price === 'number' && price > 0) spyPrices[m] = price;
        }
        for (const row of nasdaqHist.quotes) {
            const m = row.date.toISOString().substring(0, 7);
            const price = row.adjclose ?? row.close;
            if (typeof price === 'number' && price > 0) nasdaqPrices[m] = price;
        }
    } catch { return res.json([]); }

    const spyStart = spyPrices[startMonth];
    if (!spyStart) return res.json([]);
    const nasdaqStart = nasdaqPrices[startMonth];

    const result: Array<{ month: string; portfolioAnn: number; spyAnn: number; nasdaqAnn: number }> = [];
    for (const row of history) {
        const [y, m] = row.month.split('-').map(Number);
        const monthsElapsed = y * 12 + m - startMonthNum;
        // Skip the first 12 months — annualized numbers are too volatile that early
        if (monthsElapsed < 12 || row.totalInvested <= 0) continue;
        const years = monthsElapsed / 12;

        // Portfolio Ann%: uses net invested (history already deducts sell proceeds from totalInvested)
        const totalReturn = row.totalValue + row.totalDividends - row.totalInvested;
        const factor = 1 + totalReturn / row.totalInvested;
        if (factor <= 0) continue;
        const portfolioAnn = (Math.pow(factor, 1 / years) - 1) * 100;

        // SPY Ann%: lump-sum from portfolio start date to this month
        const spyPrice = spyPrices[row.month];
        if (!spyPrice) continue;
        const spyAnn = (Math.pow(spyPrice / spyStart, 1 / years) - 1) * 100;

        // Nasdaq (QQQ) Ann%: lump-sum from portfolio start date to this month
        const nasdaqPrice = nasdaqPrices[row.month];
        const nasdaqAnn = nasdaqStart && nasdaqPrice
            ? (Math.pow(nasdaqPrice / nasdaqStart, 1 / years) - 1) * 100
            : spyAnn;

        result.push({
            month: row.month,
            portfolioAnn: +portfolioAnn.toFixed(1),
            spyAnn: +spyAnn.toFixed(1),
            nasdaqAnn: +nasdaqAnn.toFixed(1),
        });
    }

    try { fs.writeFileSync(BENCHMARK_CACHE_FILE, JSON.stringify(result, null, 2)); } catch { /* ignore */ }
    res.json(result);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
