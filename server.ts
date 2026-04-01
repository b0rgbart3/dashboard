import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5001;
const DATA_FILE = path.join(__dirname, 'data', 'purchases.json');
const DIVIDENDS_FILE = path.join(__dirname, 'data', 'dividends.json');
const STOCKS_FILE = path.join(__dirname, 'data', 'stocks.json');
const PROJECTION_SETTINGS_FILE = path.join(__dirname, 'data', 'projection-settings.json');

app.use(cors());
app.use(bodyParser.json());

// Ensure the data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Ensure the data file exists
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// Ensure the dividends file exists
if (!fs.existsSync(DIVIDENDS_FILE)) {
    fs.writeFileSync(DIVIDENDS_FILE, JSON.stringify([]));
}

// Migration: backfill ticker="STRC" on all legacy records missing the field
function migrateTickerField(filePath: string): void {
    const raw = fs.readFileSync(filePath, 'utf8');
    const records: Array<Record<string, unknown>> = JSON.parse(raw);
    let dirty = false;
    for (const r of records) {
        if (!r.ticker) {
            r.ticker = 'STRC';
            dirty = true;
        }
    }
    if (dirty) fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
}
migrateTickerField(DATA_FILE);
migrateTickerField(DIVIDENDS_FILE);

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

// GET purchases (optional ?ticker= filter)
app.get('/api/purchases', (req: Request, res: Response) => {
    const ticker = req.query.ticker as string | undefined;
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error reading data file');
        }
        let purchases = JSON.parse(data);
        if (ticker) {
            purchases = purchases.filter((p: { ticker?: string }) => p.ticker === ticker);
        }
        res.json(purchases);
    });
});

// POST purchase
app.post('/api/purchases', (req: Request, res: Response) => {
    const newPurchase = req.body;

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error reading data file');
        }

        const purchases = JSON.parse(data);
        purchases.push(newPurchase);

        fs.writeFile(DATA_FILE, JSON.stringify(purchases, null, 2), (writeErr) => {
            if (writeErr) {
                console.error(writeErr);
                return res.status(500).send('Error writing data file');
            }
            res.status(201).json(newPurchase);
        });
    });
});

// DELETE purchase
app.delete('/api/purchases/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    console.log(`[DELETE] Received request for ID: ${id}`);

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading data file:', err);
            return res.status(500).send('Error reading data file');
        }

        let purchases: Array<{ id: string | number }> = [];
        try {
            purchases = JSON.parse(data);
            console.log(`[DELETE] Current file has ${purchases.length} entries. IDs: ${purchases.map(p => p.id).join(', ')}`);
        } catch (e) {
            console.error('JSON Parse Error:', e);
            return res.status(500).send('Corrupt data file');
        }

        const originalLength = purchases.length;
        purchases = purchases.filter(p => String(p.id) !== String(id));

        if (purchases.length === originalLength) {
            console.error(`[DELETE] ID ${id} not found in the list.`);
            return res.status(404).json({ error: 'Purchase not found', id, existingIds: purchases.map(p => p.id) });
        }

        fs.writeFile(DATA_FILE, JSON.stringify(purchases, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Error writing data file:', writeErr);
                return res.status(500).send('Error writing data file');
            }
            console.log(`[DELETE] Successfully removed ID: ${id}`);
            res.status(200).json({ message: 'Purchase deleted', id });
        });
    });
});

// POST bulk purchases (CSV import)
app.post('/api/purchases/bulk', (req: Request, res: Response) => {
    const newPurchases = req.body;
    if (!Array.isArray(newPurchases)) {
        return res.status(400).json({ error: 'Expected an array' });
    }

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading data file');

        const purchases = JSON.parse(data);
        const updated = [...purchases, ...newPurchases];

        fs.writeFile(DATA_FILE, JSON.stringify(updated, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing data file');
            res.status(201).json(newPurchases);
        });
    });
});

// GET dividends (optional ?ticker= filter)
app.get('/api/dividends', (req: Request, res: Response) => {
    const ticker = req.query.ticker as string | undefined;
    fs.readFile(DIVIDENDS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading dividends file');
        let dividends = JSON.parse(data);
        if (ticker) {
            dividends = dividends.filter((d: { ticker?: string }) => d.ticker === ticker);
        }
        res.json(dividends);
    });
});

// POST dividend
app.post('/api/dividends', (req: Request, res: Response) => {
    const newDividend = req.body;
    fs.readFile(DIVIDENDS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading dividends file');
        const dividends = JSON.parse(data);
        dividends.push(newDividend);
        fs.writeFile(DIVIDENDS_FILE, JSON.stringify(dividends, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing dividends file');
            res.status(201).json(newDividend);
        });
    });
});

// DELETE dividend
app.delete('/api/dividends/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    fs.readFile(DIVIDENDS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading dividends file');
        let dividends: Array<{ id: string | number }> = JSON.parse(data);
        const originalLength = dividends.length;
        dividends = dividends.filter(d => String(d.id) !== String(id));
        if (dividends.length === originalLength) {
            return res.status(404).json({ error: 'Dividend not found' });
        }
        fs.writeFile(DIVIDENDS_FILE, JSON.stringify(dividends, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing dividends file');
            res.status(200).json({ message: 'Dividend deleted', id });
        });
    });
});

// POST bulk dividends (CSV import)
app.post('/api/dividends/bulk', (req: Request, res: Response) => {
    const newDividends = req.body;
    if (!Array.isArray(newDividends)) {
        return res.status(400).json({ error: 'Expected an array' });
    }
    fs.readFile(DIVIDENDS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading dividends file');
        const dividends = JSON.parse(data);
        const updated = [...dividends, ...newDividends];
        fs.writeFile(DIVIDENDS_FILE, JSON.stringify(updated, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).send('Error writing dividends file');
            res.status(201).json(newDividends);
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

// DELETE stock
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
            res.status(200).json({ message: 'Stock deleted', ticker });
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
