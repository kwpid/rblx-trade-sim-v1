import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import './Leaderboard.css'

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('value') // 'value' or 'rap'
  const [cacheExpireTime, setCacheExpireTime] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(300) // 5 minutes in seconds

  useEffect(() => {
    fetchLeaderboard()
  }, [activeTab])

  // Countdown timer effect
  useEffect(() => {
    if (!cacheExpireTime) return

    const interval = setInterval(() => {
      const now = Date.now()
      const remaining = Math.max(0, Math.floor((cacheExpireTime - now) / 1000))
      setTimeRemaining(remaining)

      // Auto-refresh when timer expires
      if (remaining === 0) {
        fetchLeaderboard()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [cacheExpireTime])

  const fetchLeaderboard = async () => {
    setLoading(true)
    try {
      let endpoint = '/api/users/leaderboard'
      if (activeTab === 'value') {
        endpoint = '/api/users/leaderboard/value'
      } else if (activeTab === 'rap') {
        endpoint = '/api/users/leaderboard/rap'
      }

      const response = await axios.get(`${endpoint}?t=${Date.now()}`)
      setLeaderboard(response.data)

      // Set cache expiration time (5 minutes from now)
      setCacheExpireTime(Date.now() + 5 * 60 * 1000)
      setTimeRemaining(300)
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  const getValue = (player) => {
    if (activeTab === 'value') {
      return player.value || 0
    } else if (activeTab === 'rap') {
      return player.rap || 0
    }
    return player.cash || 0
  }

  const getValueLabel = () => {
    if (activeTab === 'value') return 'Value'
    if (activeTab === 'rap') return 'RAP'
    return 'Cash'
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="leaderboard">
      <div className="container">
        <div className="leaderboard-title-row">
          <h1>Leaderboard</h1>
          {!loading && (
            <div className="leaderboard-timer">
              Updates in: {formatTime(timeRemaining)}
            </div>
          )}
        </div>
        <div className="leaderboard-tabs">
          <button
            className={`leaderboard-tab ${activeTab === 'value' ? 'active' : ''}`}
            onClick={() => setActiveTab('value')}
          >
            Value
          </button>
          <button
            className={`leaderboard-tab ${activeTab === 'rap' ? 'active' : ''}`}
            onClick={() => setActiveTab('rap')}
          >
            RAP
          </button>
        </div>
        <div className="leaderboard-table">
          <div className="leaderboard-header">
            <div className="rank-col">Rank</div>
            <div className="username-col">Username</div>
            <div className="cash-col">{getValueLabel()}</div>
          </div>
          {leaderboard.map((player, index) => (
            <div key={player.id} className="leaderboard-row">
              <div className="rank-col">
                <span className={`rank ${index < 3 ? `rank-${index + 1}` : ''}`}>
                  {index + 1}
                </span>
              </div>
              <div className="username-col">
                <Link to={`/players/${player.id}`} className="leaderboard-link">
                  {player.username}
                </Link>
              </div>
              <div className="cash-col">${getValue(player).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Leaderboard

