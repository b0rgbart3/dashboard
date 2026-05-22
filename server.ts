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
        const updated = [...transactions, ...newTransactions];
        fs.writeFile(TRANSACTIONS_FILE, JSON.stringify(updated, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing transactions file');
            res.status(201).json(newTransactions);
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

app.get('/api/price/:ticker', async (req: Request, res: Response) => {
    const { ticker } = req.params;
    const yfTicker = toYfTicker(ticker);
    try {
        const quote = await yahooFinance.quote(yfTicker);
        const price = quote?.regularMarketPrice;
        if (price == null) return res.status(404).json({ error: `Price not found for ${yfTicker}` });
        res.json({ price });
    } catch (err: unknown) {
        console.error('[price]', ticker, err);
        res.status(502).json({ error: 'Failed to fetch live price' });
    }
});

// GET aggregated summary per ticker (shares, invested, estimated value, dividends)
app.get('/api/stocks/summary', async (_req: Request, res: Response) => {
    fs.readFile(TRANSACTIONS_FILE, 'utf8', async (err, data) => {
        if (err) return res.status(500).send('Error reading transactions file');
        const transactions: Array<{ ticker: string; type: string; price: number; quantity: number }> = JSON.parse(data);

        const map: Record<string, { totalShares: number; totalBuyCost: number; totalSellProceeds: number; cashIncome: number; lastPrice: number; hasDividends: boolean }> = {};

        // Must process chronologically so splits apply at the correct point
        const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        for (const t of sorted) {
            if (!map[t.ticker]) {
                map[t.ticker] = { totalShares: 0, totalBuyCost: 0, totalSellProceeds: 0, cashIncome: 0, lastPrice: 0, hasDividends: false };
            }
            const s = map[t.ticker];
            const isBuy = t.type === 'BUY' || t.type === 'purchase';
            const isSell = t.type === 'SELL';
            const isCashIncome = t.type === 'dividend' || t.type === 'MDIV' || t.type === 'CDIV' || t.type === 'SLIP';
            const isDividend = t.type === 'dividend' || t.type === 'MDIV' || t.type === 'CDIV';
            const isSplit = t.type === 'SPLIT';
            if (isBuy) { s.totalShares += t.quantity; s.totalBuyCost += t.price * t.quantity; s.lastPrice = t.price; }
            else if (isSell) { s.totalShares -= t.quantity; s.totalSellProceeds += t.price * t.quantity; }
            else if (isCashIncome) { s.cashIncome += t.price * t.quantity; if (isDividend) s.hasDividends = true; }
            else if (isSplit) { s.totalShares *= t.quantity; if (s.lastPrice > 0) s.lastPrice /= t.quantity; }
        }

        // Fetch live prices for all tickers so the filter uses current market value
        const livePrices: Record<string, number> = {};
        await Promise.allSettled(
            Object.keys(map).map(async (ticker) => {
                try {
                    const quote = await yahooFinance.quote(toYfTicker(ticker));
                    if (quote?.regularMarketPrice != null) livePrices[ticker] = quote.regularMarketPrice;
                } catch { /* fall back to last purchase price */ }
            })
        );

        const result: Record<string, { totalShares: number; totalInvested: number; sellProceeds: number; cashIncome: number; marketValue: number; totalReturn: number; hasDividends: boolean }> = {};
        for (const [ticker, s] of Object.entries(map)) {
            const price = livePrices[ticker] ?? s.lastPrice;
            const netInvested = s.totalBuyCost - s.totalSellProceeds;
            const marketValue = +(s.totalShares * price).toFixed(2);
            result[ticker] = {
                totalShares: +(s.totalShares.toFixed(6)),
                totalInvested: +(s.totalBuyCost.toFixed(2)),
                sellProceeds: +(s.totalSellProceeds.toFixed(2)),
                cashIncome: +(s.cashIncome.toFixed(2)),
                marketValue,
                totalReturn: +(marketValue + s.cashIncome - netInvested).toFixed(2),
                hasDividends: s.hasDividends,
            };
        }
        res.json(result);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
