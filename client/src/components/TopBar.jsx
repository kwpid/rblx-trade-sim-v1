import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect } from 'react'
import axios from 'axios'
import './TopBar.css'

const TopBar = () => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [cash, setCash] = useState(user?.cash || 0)

  useEffect(() => {
    if (user) {
      setCash(user.cash)
      fetchUserCash()
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
    { path: '/trade', label: 'Trade' },
    { path: '/deals', label: 'Deals' },
    { path: '/value-changes', label: 'Value Changes' },
    { path: '/leaderboard', label: 'Leaderboard' },
    { path: '/settings', label: 'Settings' }
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
              </Link>
            ))}
          </nav>
        </div>
        <div className="topbar-right">
          <div className="cash-display">
            <span className="cash-label">Cash:</span>
            <span className="cash-amount">R${formatCash(cash)}</span>
          </div>
          <div className="user-info">
            <span>{user?.username}</span>
            <button onClick={logout} className="btn btn-secondary logout-btn">
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TopBar

