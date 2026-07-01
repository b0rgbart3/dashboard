import { isValid, format } from "date-fns";
import { parseFlexibleDate, parseCSV, stripNumeric } from "../utils/csvParsing";
import { API_BASE, REQUIRED_COLUMNS } from "../utils/portfolioUtils";
import type { EntryType, Stock, StockSummary } from "../types";

export type PendingTransaction = {
  date: string;
  type: EntryType;
  quantity: number;
  price: number;
  ticker: string;
};

export type ParseResult = {
  entries: PendingTransaction[];
  errors: string[];
  skippedCount: number;
  skippedCodes: Map<string, { count: number; tickers: string[] }>;
};

export function parseRobinhoodCSV(
  rows: string[][],
  colIndex: Record<string, number>,
  amountIdx: number,
  descIdx: number
): ParseResult {
  const entries: PendingTransaction[] = [];
  const errors: string[] = [];
  let skippedCount = 0;
  const skippedCodes = new Map<string, { count: number; tickers: string[] }>();

  const dataRows = rows.slice(1);
  dataRows.sort((a, b) => {
    const dA = parseFlexibleDate(a[colIndex["activity date"]]?.trim() ?? "");
    const dB = parseFlexibleDate(b[colIndex["activity date"]]?.trim() ?? "");
    if (!dA || !dB) return 0;
    return dA.getTime() - dB.getTime();
  });

  const KNOWN_TYPES = new Set(['BUY', 'SELL', 'SLIP', 'MDIV', 'CDIV', 'DTAX', 'DFEE', 'AFEE', 'REC', 'dividend', 'purchase']);
  const runningQtys: Record<string, number> = {};
  // Tracks the running qty at the time the FIRST MRGS row fires for a given ticker+date pair.
  // Used to detect which of two same-date MRGS rows is the outgoing (removal) share leg. [HUT-style]
  const preMergerQtys: Record<string, number> = {}; // "TICKER::YYYY-MM-DD" → qty before any MRGS
  // Tracks SPINOFF events by ticker+date+qty (4 dp) to skip duplicate MRGS rows on the same date. [CORZ-style]
  const spinoffsByKey = new Set<string>(); // "TICKER::YYYY-MM-DD::qty.toFixed(4)"
  // Tracks cumulative MRGS_MERGER qty added per ticker to detect re-opening of a closed position. [CORZ^-style]
  const mrgsNetReceived: Record<string, number> = {}; // ticker → total qty added via MRGS (non-cancelled)

  for (let i = 0; i < dataRows.length; i++) {
    const cols = dataRows[i];

    const rawTicker = cols[colIndex["instrument"]]?.trim() ?? "";
    const rawDate   = cols[colIndex["activity date"]]?.trim() ?? "";
    const rawCode   = cols[colIndex["trans code"]]?.trim().toUpperCase() ?? "";
    const rawQty    = cols[colIndex["quantity"]]?.trim() ?? "";
    const rawPrice  = cols[colIndex["price"]]?.trim() ?? "";
    const rawAmount = amountIdx >= 0 ? (cols[amountIdx]?.trim() ?? "") : "";
    const rawDesc   = descIdx   >= 0 ? (cols[descIdx]?.trim()   ?? "") : "";

    const ticker = rawTicker.toUpperCase();
    if (!ticker || !rawCode) { skippedCount++; continue; }

    const parsedDate = parseFlexibleDate(rawDate);
    if (!parsedDate || !isValid(parsedDate)) {
      if (rawDate) errors.push(`Row ${i + 1}: invalid date "${rawDate}"`);
      else skippedCount++;
      continue;
    }
    const date = format(parsedDate, "yyyy-MM-dd");

    const qty = rawQty ? parseFloat(stripNumeric(rawQty)) : 1;
    if (isNaN(qty)) {
      errors.push(`Row ${i + 1}: invalid quantity "${rawQty}"`);
      continue;
    }

    const priceRaw = rawPrice || rawAmount;
    const price = priceRaw ? parseFloat(stripNumeric(priceRaw)) : 0;
    if (isNaN(price)) {
      errors.push(`Row ${i + 1}: invalid price "${priceRaw}"`);
      continue;
    }

    if (rawCode === 'SPL') {
      const priorQty = runningQtys[ticker] ?? 0;
      if (priorQty > 0) {
        const ratio = (priorQty + qty) / priorQty;
        entries.push({ date, type: 'SPLIT', quantity: +ratio.toFixed(8), price: 0, ticker });
        runningQtys[ticker] = priorQty + qty;
      } else {
        errors.push(`Row ${i + 1}: SPL for ${ticker} on ${date} skipped — no prior shares to derive ratio`);
      }
      continue;
    }

    if (rawCode === 'SPR') {
      const nextCols = dataRows[i + 1];
      if (nextCols) {
        const nextCode   = nextCols[colIndex["trans code"]]?.trim().toUpperCase();
        const nextTicker = nextCols[colIndex["instrument"]]?.trim().toUpperCase();
        const nextDate   = nextCols[colIndex["activity date"]]?.trim();
        const nextQtyRaw = nextCols[colIndex["quantity"]]?.trim() ?? "";
        const nextQty    = nextQtyRaw ? parseFloat(stripNumeric(nextQtyRaw)) : NaN;
        if (nextCode === 'SPR' && nextTicker === ticker && nextDate === rawDate && !isNaN(nextQty) && qty > 0) {
          const priorQty = runningQtys[ticker] ?? 0;
          let oldQty: number, newQty: number;
          if (priorQty > 0 && Math.abs(nextQty - priorQty) < Math.abs(qty - priorQty)) {
            oldQty = nextQty; newQty = qty;
          } else {
            oldQty = qty; newQty = nextQty;
          }
          const ratio = oldQty > 0 ? +(newQty / oldQty).toFixed(8) : 1;
          entries.push({ date, type: 'SPLIT', quantity: ratio, price: 0, ticker });
          runningQtys[ticker] = newQty;
          i++;
          continue;
        }
      }
      entries.push({ date, type: 'SELL', quantity: qty, price, ticker });
      runningQtys[ticker] = (runningQtys[ticker] ?? 0) - qty;
      continue;
    }

    if (rawCode === 'MRGS' || rawCode === 'MRGC') {
      const explicitQty = rawQty ? parseFloat(stripNumeric(rawQty)) : NaN;
      const hasMergerShares = !isNaN(explicitQty) && explicitQty > 0;
      if (hasMergerShares) {
        if (rawCode === 'MRGS') {
          const amountVal = rawAmount ? parseFloat(stripNumeric(rawAmount)) : NaN;
          const mergerKey = `${ticker}::${date}`;
          // Record the running qty before any MRGS rows fire for this ticker+date
          if (!(mergerKey in preMergerQtys)) preMergerQtys[mergerKey] = runningQtys[ticker] ?? 0;
          const preMergerQty = preMergerQtys[mergerKey];
          // Detect the outgoing (removal) leg:
          //   1. Robinhood marks it with a negative amount, OR
          //   2. Heuristic: qty ≈ pre-merger holding (within 1%) — the leg that "returned" all
          //      the old shares before the merger deposited new ones.
          const isOutgoing = (!isNaN(amountVal) && amountVal < 0) ||
            (preMergerQty > 0 && Math.abs(explicitQty - preMergerQty) / preMergerQty < 0.01);
          if (isOutgoing) {
            entries.push({ date, type: 'SHARE_EXCHANGE_OUT', quantity: explicitQty, price: 0, ticker });
            runningQtys[ticker] = Math.max(0, (runningQtys[ticker] ?? 0) - explicitQty);
          } else {
            // [CORZ-style] Skip MRGS if a SPINOFF on the same date already accounts for these shares
            const spinoffKey = `${ticker}::${date}::${explicitQty.toFixed(4)}`;
            const isDupOfSpinoff = spinoffsByKey.has(spinoffKey);

            // [CORZ^-style] Skip MRGS if the position was just closed and qty matches prior total receipt
            const currentQty = runningQtys[ticker] ?? 0;
            const prevReceived = mrgsNetReceived[ticker] ?? 0;
            const isDupReopen = currentQty < 0.001 && prevReceived > 0 &&
              Math.abs(explicitQty - prevReceived) / prevReceived < 0.01;

            if (!isDupOfSpinoff && !isDupReopen) {
              entries.push({ date, type: 'MRGS_MERGER', quantity: explicitQty, price: Math.abs(price), ticker });
              runningQtys[ticker] = (runningQtys[ticker] ?? 0) + explicitQty;
              mrgsNetReceived[ticker] = (mrgsNetReceived[ticker] ?? 0) + explicitQty;
            }
            // else: silently suppress — this MRGS is a duplicate of an already-counted event
          }
        } else {
          entries.push({ date, type: 'MRGC_MERGER', quantity: explicitQty, price: Math.abs(price), ticker });
        }
      } else {
        const descUpper = rawDesc.toUpperCase();
        const hasMergerDescription =
          ['MERGER', 'ACQUISITION', 'ACQUIRED', 'CASH RECEIVED THRU'].some(kw => descUpper.includes(kw));

        if (rawCode === 'MRGC' && hasMergerDescription) {
          const totalCash = Math.abs(parseFloat(stripNumeric(rawAmount)) || price || 0);
          if (totalCash > 0) {
            entries.push({ date, type: 'MRGC_MERGER', quantity: 0, price: totalCash, ticker });
          }
        } else {
          const marginAmount = Math.abs(price || parseFloat(stripNumeric(rawAmount)) || 0);
          if (marginAmount > 0) {
            entries.push({ date, type: rawCode as EntryType, quantity: 1, price: marginAmount, ticker });
          }
        }
      }
      continue;
    }

    if (rawCode === 'BCXL') { skippedCount++; continue; }

    if (rawCode === 'SOFF') {
      entries.push({ date, type: 'SPINOFF', quantity: qty, price: Math.abs(price), ticker });
      runningQtys[ticker] = (runningQtys[ticker] ?? 0) + qty;
      // Record so a duplicate MRGS on the same date+qty can be suppressed [CORZ-style]
      spinoffsByKey.add(`${ticker}::${date}::${qty.toFixed(4)}`);
      continue;
    }

    if (rawCode === 'SXCH') {
      const amountVal = rawAmount ? parseFloat(stripNumeric(rawAmount)) : NaN;
      const isOut = price < 0
        || (!isNaN(amountVal) && amountVal < 0)
        || (price === 0 && (isNaN(amountVal) || amountVal === 0) && (runningQtys[ticker] ?? 0) > 0);
      if (isOut) {
        entries.push({ date, type: 'SHARE_EXCHANGE_OUT', quantity: qty, price: 0, ticker });
        runningQtys[ticker] = Math.max(0, (runningQtys[ticker] ?? 0) - qty);
      } else {
        entries.push({ date, type: 'SHARE_EXCHANGE', quantity: qty, price: Math.abs(price), ticker });
        runningQtys[ticker] = (runningQtys[ticker] ?? 0) + qty;
      }
      continue;
    }

    if (rawCode === 'ROC') {
      entries.push({ date, type: 'RETURN_OF_CAPITAL', quantity: qty, price: Math.abs(price), ticker });
      continue;
    }

    if (!KNOWN_TYPES.has(rawCode)) {
      const entry = skippedCodes.get(rawCode) ?? { count: 0, tickers: [] as string[] };
      entry.count++;
      if (!entry.tickers.includes(ticker)) entry.tickers.push(ticker);
      skippedCodes.set(rawCode, entry);
      continue;
    }

    if (rawCode === 'BUY' || rawCode === 'purchase' || rawCode === 'REC') runningQtys[ticker] = (runningQtys[ticker] ?? 0) + qty;
    else if (rawCode === 'SELL') runningQtys[ticker] = (runningQtys[ticker] ?? 0) - qty;

    const entryPrice = (rawCode === 'DTAX' || rawCode === 'DFEE' || rawCode === 'AFEE') ? Math.abs(price) : price;
    entries.push({ date, type: rawCode as EntryType, quantity: qty, price: entryPrice, ticker });
  }

  // POST-PROCESSING: pair SHARE_EXCHANGE_OUT + MRGC_MERGER on same date+ticker → single SELL
  {
    const exchOutMap = new Map<string, number>();
    const mrgCashMap = new Map<string, number>();
    entries.forEach((e, idx) => {
      const key = `${e.date}::${e.ticker}`;
      if (e.type === 'SHARE_EXCHANGE_OUT' || e.type === 'MRGS_MERGER') exchOutMap.set(key, idx);
      if (e.type === 'MRGC_MERGER') mrgCashMap.set(key, idx);
    });

    const toRemove = new Set<number>();
    const toAdd: PendingTransaction[] = [];
    for (const [key, exchIdx] of exchOutMap) {
      const cashIdx = mrgCashMap.get(key);
      if (cashIdx === undefined) continue;
      const exchEntry = entries[exchIdx];
      const cashEntry = entries[cashIdx];
      const sellQty = exchEntry.quantity;
      const sellPrice = cashEntry.quantity > 0
        ? cashEntry.price
        : sellQty > 0 ? +(cashEntry.price / sellQty).toFixed(6) : 0;
      if (sellQty > 0 && sellPrice > 0) {
        toRemove.add(exchIdx);
        toRemove.add(cashIdx);
        toAdd.push({ date: exchEntry.date, type: 'SELL', quantity: sellQty, price: sellPrice, ticker: exchEntry.ticker });
      }
    }
    if (toRemove.size > 0) {
      const filtered = entries.filter((_, idx) => !toRemove.has(idx));
      filtered.push(...toAdd);
      entries.length = 0;
      entries.push(...filtered);
    }
  }

  return { entries, errors, skippedCount, skippedCodes };
}

export async function submitImport(
  entries: PendingTransaction[],
  onProgress: (msg: string) => void
): Promise<{ stocksData: Stock[]; summaryData: Record<string, StockSummary>; duplicatesSkipped: number }> {
  const stocksRes = await fetch(`${API_BASE}/api/stocks`);
  const existingStocks: { ticker: string }[] = await stocksRes.json();
  const existingTickers = new Set(existingStocks.map((s) => s.ticker.toUpperCase()));

  const uniqueTickers = [...new Set(entries.map((e) => e.ticker))];
  const today = new Date().toISOString().split("T")[0];
  const newTickers = uniqueTickers.filter((t) => !existingTickers.has(t));
  let batchLookup: Record<string, { name: string; shortName?: string }> = {};
  if (newTickers.length > 0) {
    onProgress(`Looking up ${newTickers.length} new ticker${newTickers.length !== 1 ? "s" : ""}…`);
    try {
      const batchRes = await fetch(`${API_BASE}/api/lookup/batch?tickers=${newTickers.join(",")}`);
      if (batchRes.ok) batchLookup = await batchRes.json() as Record<string, { name: string; shortName?: string }>;
    } catch { /* fall back to ticker symbols */ }
    const stocksToCreate = newTickers.map((ticker) => {
      const info = batchLookup[ticker] ?? {};
      const name = info.name && info.name !== ticker ? info.name : ticker;
      const shortName = info.shortName;
      return { id: ticker, ticker, name, shortName, createdAt: today };
    });
    await fetch(`${API_BASE}/api/stocks/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stocksToCreate),
    });
  }

  onProgress(`Sending ${entries.length} transaction${entries.length !== 1 ? "s" : ""} to server…`);
  const withIds = entries.map((e, i) => ({ ...e, id: Date.now() + i }));
  const importRes = await fetch(`${API_BASE}/api/transactions/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withIds),
  });
  if (!importRes.ok) throw new Error(`Server error: ${importRes.status}`);
  const { skipped: duplicatesSkipped } = await importRes.json() as { inserted: unknown[]; skipped: number };

  onProgress("Refreshing portfolio summary…");
  await fetch(`${API_BASE}/api/stocks/summary/refresh`, { method: "POST" });
  const [stocksData, summaryData] = await Promise.all([
    fetch(`${API_BASE}/api/stocks`).then((r) => r.json()),
    fetch(`${API_BASE}/api/stocks/summary`).then((r) => r.json()),
  ]);
  return { stocksData, summaryData, duplicatesSkipped };
}
