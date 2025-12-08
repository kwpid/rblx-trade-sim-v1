import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect } from 'react'
import axios from 'axios'
import './TopBar.css'

const TopBar = () => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [cash, setCash] = useState(user?.cash || 0)
  const [paycheckTimer, setPaycheckTimer] = useState(60)

  useEffect(() => {
    if (user) {
      setCash(user.cash)
      fetchUserCash()
    }
  }, [user])

  useEffect(() => {
    const interval = setInterval(() => {
      setPaycheckTimer(prev => {
        if (prev <= 1) {
          fetchUserCash()
          return 60
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

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
    { path: '/catalog', label: 'Catalog' },
    { path: '/profile', label: 'My Profile' },
    { path: '/players', label: 'Players' },
    { path: '/trade', label: 'Trade' },
    { path: '/deals', label: 'Deals' },
    { path: '/leaderboard', label: 'Leaderboard' },
    { path: '/settings', label: 'Settings' }
  ]

  if (user?.is_admin) {
    tabs.splice(1, 0, { path: '/admin', label: 'Admin' })
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
                className={`tab ${location.pathname === tab.path ? 'active' : ''}`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="topbar-right">
          <div className="paycheck-timer">
            <span>Next Paycheck: {paycheckTimer}s</span>
          </div>
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

