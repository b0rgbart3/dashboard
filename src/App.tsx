import { useState, useEffect, useRef } from 'react'
import Dashboard from './Dashboard'
import HomePage from './HomePage'
import type { FilterValue, Stock, StockSummary, Transaction, ProjectionSettings } from './types'
import './index.css'

function App() {
  const [page, setPage] = useState<'home' | 'dashboard'>('home')
  const [homeMessage, setHomeMessage] = useState<string | null>(null)
  const [dashboardTicker, setDashboardTicker] = useState<string | undefined>(undefined)
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active')
  const [filterValue, setFilterValue] = useState<FilterValue>('gt1000')
  const [filterDividends, setFilterDividends] = useState<'all' | 'yes' | 'no'>('all')

  const [stocks, setStocks] = useState<Stock[]>([])
  const [summaries, setSummaries] = useState<Record<string, StockSummary>>({})
  const [portfolioLoaded, setPortfolioLoaded] = useState(false)

  // Session-level caches — survive navigation between HomePage and Dashboard
  const lookedUpTickers = useRef(new Set<string>())
  const [transactionCache, setTransactionCache] = useState<Record<string, Transaction[]>>({})
  const [priceCache, setPriceCache] = useState<Record<string, { price: number; fetchedAt: number }>>({})
  const [projectionSettingsCache, setProjectionSettingsCache] = useState<Record<string, ProjectionSettings>>({})

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:5001/api/stocks').then(r => r.json()),
      fetch('http://localhost:5001/api/stocks/summary').then(r => r.json()),
    ]).then(([stocksData, summaryData]: [Stock[], Record<string, StockSummary>]) => {
      setStocks(stocksData)
      setSummaries(summaryData)
      setPortfolioLoaded(true)
    }).catch(() => setPortfolioLoaded(true))
  }, [])

  return (
    <div className="App">
      {page === 'home'
        ? <HomePage
            onNavigateToDashboard={(ticker?: string) => { setHomeMessage(null); setDashboardTicker(ticker); if (ticker) window.location.hash = ticker; setPage('dashboard'); }}
            message={homeMessage}
            onClearMessage={() => setHomeMessage(null)}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            filterValue={filterValue}
            onFilterValueChange={setFilterValue}
            filterDividends={filterDividends}
            onFilterDividendsChange={setFilterDividends}
            stocks={stocks}
            onStocksChange={setStocks}
            summaries={summaries}
            onSummariesChange={setSummaries}
            portfolioLoaded={portfolioLoaded}
            lookedUpTickers={lookedUpTickers}
          />
        : <Dashboard
            onBack={(msg?: string) => { window.location.hash = ''; setHomeMessage(msg ?? null); setDashboardTicker(undefined); setPage('home'); }}
            initialTicker={dashboardTicker}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            filterValue={filterValue}
            onFilterValueChange={setFilterValue}
            filterDividends={filterDividends}
            onFilterDividendsChange={setFilterDividends}
            stocks={stocks}
            onStocksChange={setStocks}
            summaries={summaries}
            portfolioLoaded={portfolioLoaded}
            lookedUpTickers={lookedUpTickers}
            transactionCache={transactionCache}
            onTransactionCacheChange={setTransactionCache}
            priceCache={priceCache}
            onPriceCacheChange={setPriceCache}
            projectionSettingsCache={projectionSettingsCache}
            onProjectionSettingsCacheChange={setProjectionSettingsCache}
          />
      }
    </div>
  )
}

export default App
