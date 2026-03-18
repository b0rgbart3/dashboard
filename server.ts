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

// GET purchases
app.get('/api/purchases', (_req: Request, res: Response) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error reading data file');
        }
        res.json(JSON.parse(data));
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

// GET dividends
app.get('/api/dividends', (_req: Request, res: Response) => {
    fs.readFile(DIVIDENDS_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error reading dividends file');
        res.json(JSON.parse(data));
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
