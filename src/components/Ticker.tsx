import { TrendingUp } from "lucide-react";

interface TickerProps {
  symbol: string;
  name?: string;
  price: number;
  isLive?: boolean;
  totalShares?: number;
  marketValue?: number;
  totalInvested?: number;
  sellProceeds?: number;
  cashIncome?: number;
  dividendIncome?: number;
  avgPurchasePrice?: number | null;
  earliestPurchaseDate?: string | null;
  activeInvestmentYears?: number | null;
}

const LABEL_STYLE: React.CSSProperties = { fontSize: '0.7rem', color: '#6b7280' };

const Ticker = ({
  symbol,
  name,
  price,
  isLive = false,
  totalShares = 0,
  marketValue = 0,
  totalInvested = 0,
  sellProceeds = 0,
  cashIncome = 0,
  dividendIncome = 0,
  avgPurchasePrice = null,
  earliestPurchaseDate = null,
  activeInvestmentYears = null,
}: TickerProps) => {
  const netInvested = totalInvested - sellProceeds;
  const totalGainDollars = marketValue + cashIncome - netInvested;
  const totalReturn =
    totalInvested > 0
      ? (totalGainDollars / totalInvested) * 100
      : null;

  const yearsHeld =
    earliestPurchaseDate
      ? (Date.now() - new Date(earliestPurchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      : null;

  const dividendReturnPct =
    totalInvested > 0 && dividendIncome > 0
      ? (dividendIncome / totalInvested) * 100
      : null;

  const effectiveYears =
    yearsHeld !== null && yearsHeld < 1
      ? yearsHeld
      : activeInvestmentYears;

  const avgAnnualReturn =
    totalReturn !== null && effectiveYears !== null && effectiveYears > 0
      ? totalReturn / effectiveYears
      : null;

  const effectiveAnnualReturn =
    dividendReturnPct !== null && yearsHeld !== null && yearsHeld > 0
      ? dividendReturnPct / yearsHeld
      : null;

  return (
    <div
      className="glass-card"
      style={{ display: "flex", flexDirection: "row" }}
    >
      <div style={{ width: "33.333%" }} className="flex flex-col gap-0.5">
        <TrendingUp className="text-accent-purple" size={20} />
        <h1 className="text-3xl font-bold leading-tight">{symbol}</h1>
        <p className="text-text-secondary text-sm">{name ?? "Stock Tracker"}</p>
        <p style={{ ...LABEL_STYLE, marginTop: '4px' }}>Current Price</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="text-accent-green font-semibold text-sm">
            $
            {price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {isLive && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', color: '#22c55e', border: '1px solid #22c55e', borderRadius: '4px', padding: '0 4px', lineHeight: '1.4' }}>
              LIVE
            </span>
          )}
        </div>
        {avgPurchasePrice !== null && (
          <>
            <p style={{ ...LABEL_STYLE, marginTop: '4px' }}>Avg Purchase Price</p>
            <span className="text-accent-green font-semibold text-sm">
              $
              {avgPurchasePrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </>
        )}
      </div>

      <div style={{ width: "33.333%" }} className="flex items-center justify-center">
        <div className="bg-white/5 border border-white/10 rounded-xl px-6 py-4">
          <div style={LABEL_STYLE}>Market Value</div>
          <div
            className="font-bold font-outfit text-accent-purple"
            style={{ fontSize: "1.875rem", lineHeight: 1 }}
          >
            $
            {marketValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-sm mt-2">
            <span className="text-accent-blue font-semibold">{totalShares.toLocaleString()}</span>
            <span className="text-white"> shares held</span>
          </div>
          <div className="text-sm mt-1 flex gap-1">
            <span style={LABEL_STYLE}>Total Invested:</span>
            <span className="font-semibold text-accent-green">
              $
              {totalInvested.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          {totalReturn !== null && (
            <>
              <div className="text-sm mt-1 flex gap-1">
                <span style={LABEL_STYLE}>Total Gain:</span>
                <span className="font-semibold" style={{ color: totalGainDollars >= 0 ? 'var(--success-green)' : 'var(--danger-red, #f87171)' }}>
                  {totalGainDollars >= 0 ? "+" : "-"}$
                  {Math.abs(totalGainDollars).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="text-sm mt-1 flex gap-1">
                <span style={LABEL_STYLE}>Total Return:</span>
                <span
                  className="font-semibold"
                  style={{
                    color:
                      totalReturn >= 0
                        ? "var(--success-green)"
                        : "var(--danger-red, #f87171)",
                  }}
                >
                  {totalReturn >= 0 ? "+" : ""}
                  {totalReturn.toFixed(2)}%
                </span>
              </div>
              {avgAnnualReturn !== null && effectiveYears !== null && (
                <>
                  <div className="text-sm mt-1 flex gap-1">
                    <span style={LABEL_STYLE}>Avg Annual Return:</span>
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          avgAnnualReturn >= 0
                            ? "var(--success-green)"
                            : "var(--danger-red, #f87171)",
                      }}
                    >
                      {avgAnnualReturn >= 0 ? "+" : ""}
                      {avgAnnualReturn.toFixed(2)}%
                    </span>
                    <span style={LABEL_STYLE}>
                      ({effectiveYears < 1 ? effectiveYears.toFixed(2) : effectiveYears} yr{effectiveYears !== 1 ? "s" : ""})
                    </span>
                  </div>
                  <div className="text-sm mt-1 flex gap-1">
                    <span style={LABEL_STYLE}>Avg Annual Gain:</span>
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          totalGainDollars >= 0
                            ? "var(--success-green)"
                            : "var(--danger-red, #f87171)",
                      }}
                    >
                      {totalGainDollars >= 0 ? "+" : "-"}$
                      {Math.abs(totalGainDollars / effectiveYears).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="text-sm mt-1 flex gap-1">
                    <span style={LABEL_STYLE}>Avg Monthly Gain:</span>
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          totalGainDollars >= 0
                            ? "var(--success-green)"
                            : "var(--danger-red, #f87171)",
                      }}
                    >
                      {totalGainDollars >= 0 ? "+" : "-"}$
                      {Math.abs(totalGainDollars / effectiveYears / 12).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {cashIncome > 0 && (
        <div style={{ width: "33.333%" }} className="flex items-center justify-end">
          <div className="bg-white/5 border border-white/10 rounded-xl px-6 py-4">
            <div style={LABEL_STYLE}>Cash Income</div>
            <div
              className="font-bold font-outfit text-accent-green"
              style={{ fontSize: "1.875rem", lineHeight: 1 }}
            >
              $
              {cashIncome.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            {dividendReturnPct !== null && (
              <>
                <div style={{ ...LABEL_STYLE, marginTop: '4px' }}>Dividend % Gain</div>
                <div
                  className="text-sm font-semibold"
                  style={{
                    color:
                      dividendReturnPct >= 0
                        ? "var(--accent-green)"
                        : "var(--error-red, #f87171)",
                  }}
                >
                  {dividendReturnPct >= 0 ? "+" : ""}
                  {dividendReturnPct.toFixed(2)}%
                </div>
              </>
            )}
            {effectiveAnnualReturn !== null && (
              <>
                <div style={{ ...LABEL_STYLE, marginTop: '4px' }}>Effective Annual Return</div>
                <div
                  className="text-sm font-semibold"
                  style={{
                    color:
                      effectiveAnnualReturn >= 0
                        ? "var(--accent-green)"
                        : "var(--error-red, #f87171)",
                  }}
                >
                  {effectiveAnnualReturn >= 0 ? "+" : ""}
                  {effectiveAnnualReturn.toFixed(2)}%
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Ticker;
