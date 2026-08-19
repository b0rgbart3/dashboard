import { useState, useEffect, useRef } from 'react'
import Dashboard from './Dashboard'
import HomePage from './HomePage'
import DataModeToggle from './components/DataModeToggle'
import type { FilterValue, Stock, StockSummary, Transaction, ProjectionSettings } from './types'
import { API_BASE } from './utils/portfolioUtils'
import './index.css'

function App() {
  const initialHash = window.location.hash.slice(1).toUpperCase() || undefined
  const [page, setPage] = useState<'home' | 'dashboard'>(initialHash ? 'dashboard' : 'home')
  const [homeMessage, setHomeMessage] = useState<string | null>(null)
  const [dashboardTicker, setDashboardTicker] = useState<string | undefined>(initialHash)
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>(
    () => (localStorage.getItem('filterStatus') as 'all' | 'active' | 'inactive') ?? 'active'
  )
  const [filterValue, setFilterValue] = useState<FilterValue>(
    () => (localStorage.getItem('filterValue') as FilterValue) ?? 'gt1000'
  )
  const [filterDividends, setFilterDividends] = useState<'all' | 'yes' | 'no'>(
    () => (localStorage.getItem('filterDividends') as 'all' | 'yes' | 'no') ?? 'all'
  )

  useEffect(() => { localStorage.setItem('filterStatus', filterStatus) }, [filterStatus])
  useEffect(() => { localStorage.setItem('filterValue', filterValue) }, [filterValue])
  useEffect(() => { localStorage.setItem('filterDividends', filterDividends) }, [filterDividends])

  const [stocks, setStocks] = useState<Stock[]>([])
  const [summaries, setSummaries] = useState<Record<string, StockSummary>>({})
  const [portfolioLoaded, setPortfolioLoaded] = useState(false)

  // Session-level caches — survive navigation between HomePage and Dashboard
  const lookedUpTickers = useRef(new Set<string>())
  const [transactionCache, setTransactionCache] = useState<Record<string, Transaction[]>>({})
  const [priceCache, setPriceCache] = useState<Record<string, { price: number; fetchedAt: number }>>({})
  const [projectionSettingsCache, setProjectionSettingsCache] = useState<Record<string, ProjectionSettings>>({})

  const [dataMode, setDataMode] = useState<'real' | 'mock' | null>(null)
  const [showChooser, setShowChooser] = useState(false)

  // Resolve which data source to use before loading any portfolio data — first-run visitors
  // get a chooser; returning visitors' stored choice is resynced against the server (which may
  // have restarted and reverted to its DATA_MODE env default).
  useEffect(() => {
    fetch(`${API_BASE}/api/data-mode`).then(r => r.json()).then(({ mode }: { mode: 'real' | 'mock' }) => {
      const stored = localStorage.getItem('dataModeChoice') as 'real' | 'mock' | null
      if (!stored) {
        setDataMode(mode)
        setShowChooser(true)
        return
      }
      if (stored !== mode) {
        fetch(`${API_BASE}/api/data-mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: stored }),
        }).finally(() => setDataMode(stored))
      } else {
        setDataMode(stored)
      }
    }).catch(() => setDataMode('real'))
  }, [])

  const handleModeSelect = (newMode: 'real' | 'mock') => {
    localStorage.setItem('dataModeChoice', newMode)
    if (newMode !== dataMode) {
      fetch(`${API_BASE}/api/data-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      }).finally(() => window.location.reload())
    } else {
      setShowChooser(false)
    }
  }

  useEffect(() => {
    if (dataMode === null || showChooser) return
    Promise.all([
      fetch(`${API_BASE}/api/stocks`).then(r => r.json()),
      fetch(`${API_BASE}/api/stocks/summary`).then(r => r.json()),
    ]).then(([stocksData, summaryData]: [Stock[], Record<string, StockSummary>]) => {
      setStocks(stocksData)
      setSummaries(summaryData)
      setPortfolioLoaded(true)
    }).catch(() => setPortfolioLoaded(true))
  }, [dataMode, showChooser])

  return (
    <div className="App">
      {dataMode !== null && (
        <DataModeToggle mode={dataMode} showChooser={showChooser} onSelect={handleModeSelect} />
      )}
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
            onTransactionCacheChange={setTransactionCache}
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
