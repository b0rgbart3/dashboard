import { useState } from 'react'
import Dashboard from './Dashboard'
import HomePage from './HomePage'
import './index.css'

function App() {
  const [page, setPage] = useState<'home' | 'dashboard'>('home')
  const [homeMessage, setHomeMessage] = useState<string | null>(null)

  return (
    <div className="App">
      {page === 'home'
        ? <HomePage
            onNavigateToDashboard={() => { setHomeMessage(null); setPage('dashboard'); }}
            message={homeMessage}
            onClearMessage={() => setHomeMessage(null)}
          />
        : <Dashboard onBack={(msg?: string) => { setHomeMessage(msg ?? null); setPage('home'); }} />
      }
    </div>
  )
}

export default App
