import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { useState, useEffect } from 'react'
import axios from 'axios'
import './TopBar.css'

/* Inline styles fix for badge if css file not opened */
/* .nav-badge { background: red; color: white; border-radius: 50%; padding: 2px 6px; font-size: 10px; margin-left: 5px; vertical-align: super; } */

const TopBar = () => {
  const { user, logout } = useAuth()
  const { inboundCount } = useNotifications()
  const location = useLocation()
  const [cash, setCash] = useState(user?.cash || 0)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [paycheckTimer, setPaycheckTimer] = useState(60)

  useEffect(() => {
    setIsMenuOpen(false)
  }, [location])

  // State for inbound trades count -- Managed by Context now

  useEffect(() => {
    if (user) {
      setCash(user.cash)
      fetchUserCash()
      // Trades fetched by Context now

      // Paycheck Timer (60s loop matches backend/simulated cycle)
      const timerInterval = setInterval(() => {
        setPaycheckTimer(prev => {
          if (prev <= 1) {
            fetchUserCash() // Refresh cash when timer hits 0
            return 60
          }
          return prev - 1
        })
      }, 1000)

      return () => {
        clearInterval(timerInterval)
      }
    }
  }, [user])

  const fetchUserCash = async () => {
    try {
      const response = await axios.get('/api/users/me/profile')
      setCash(response.data.cash)
    } catch (error) {
      console.error('Error fetching cash:', error)
    }
  }

  const formatCash = (amount) => {
    return new Intl.NumberFormat('en-US').format(amount)
  }

  const tabs = [
    { path: '/', label: 'Catalog' },
    { path: '/profile', label: 'Profile' },
    { path: '/players', label: 'Players' },
    { path: '/trades', label: 'Trade' },

    { path: '/transactions', label: 'Transactions' },
    { path: '/value-changes', label: 'Value Changes' },
    { path: '/leaderboard', label: 'Leaderboard' }
  ]

  if (user?.is_admin) {
    tabs.splice(1, 0, { path: '/admin', label: 'Admin' })
  }

  // Check if current path matches tab (including root)
  const isActive = (tabPath) => {
    if (tabPath === '/') {
      return location.pathname === '/' || location.pathname === '/catalog'
    }
    return location.pathname === tabPath || location.pathname.startsWith(tabPath + '/')
  }

  return (
    <div className="topbar">
      <div className="topbar-content">
        <div className="topbar-left">
          <button
            className={`hamburger-btn ${isMenuOpen ? 'active' : ''}`}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <Link to="/" className="logo">
            <h2>Roblox Trade Simulator</h2>
          </Link>
          <nav className="tabs">
            {tabs.map(tab => (
              <Link
                key={tab.path}
                to={tab.path}
                className={`tab ${isActive(tab.path) ? 'active' : ''}`}
              >
                {tab.label}
                {tab.label === 'Trade' && inboundCount > 0 && (
                  <span className="nav-badge">{inboundCount}</span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        <div className="topbar-right">
          <div className="cash-display">
            <span className="cash-label">Cash:</span>
            <span className="cash-amount">R${formatCash(cash)}</span>
          </div>
          <div className="paycheck-display" title="Next Paycheck">
            <span className="paycheck-icon">💰</span>
            <span className="paycheck-timer">{paycheckTimer}s</span>
          </div>
          <div className="user-info">
            <span>{user?.username}</span>
            <button onClick={logout} className="btn btn-secondary logout-btn">
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className={`mobile-menu-overlay ${isMenuOpen ? 'open' : ''}`} onClick={() => setIsMenuOpen(false)}></div>

      <div className={`mobile-menu ${isMenuOpen ? 'open' : ''}`}>
        {tabs.map(tab => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`mobile-nav-item ${isActive(tab.path) ? 'active' : ''}`}
          >
            {tab.label}
            {tab.label === 'Trade' && inboundCount > 0 && (
              <span className="nav-badge">{inboundCount}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default TopBar

