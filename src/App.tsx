import { useState } from 'react'
import Dashboard from './Dashboard'
import HomePage from './HomePage'
import './index.css'

function App() {
  const [page, setPage] = useState<'home' | 'dashboard'>('home')

  return (
    <div className="App">
      {page === 'home'
        ? <HomePage onNavigateToDashboard={() => setPage('dashboard')} />
        : <Dashboard onBack={() => setPage('home')} />
      }
    </div>
  )
}

export default App
