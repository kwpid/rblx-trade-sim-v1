import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import './Leaderboard.css'

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('value') // 'value' or 'rap'

  // Separate cache for each tab type
  const [tabCache, setTabCache] = useState({
    value: { data: null, expireTime: null },
    rap: { data: null, expireTime: null }
  })

  const [timeRemaining, setTimeRemaining] = useState(300) // 5 minutes in seconds

  useEffect(() => {
    // Check if we have cached data for this tab
    const cache = tabCache[activeTab]
    if (cache.data && cache.expireTime && Date.now() < cache.expireTime) {
      // Use cached data
      setLeaderboard(cache.data)
      setLoading(false)
      // Also update timeRemaining based on cached expireTime
      const remaining = Math.max(0, Math.floor((cache.expireTime - Date.now()) / 1000))
      setTimeRemaining(remaining)
    } else {
      // Fetch new data
      fetchLeaderboard()
    }
  }, [activeTab, tabCache])

  // Countdown timer effect - uses the current active tab's expiration
  useEffect(() => {
    const cache = tabCache[activeTab]
    if (!cache.expireTime) return

    const interval = setInterval(() => {
      const now = Date.now()
      const remaining = Math.max(0, Math.floor((cache.expireTime - now) / 1000))
      setTimeRemaining(remaining)

      // Auto-refresh when timer expires
      if (remaining === 0) {
        fetchLeaderboard()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [activeTab, tabCache])

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
      const data = response.data
      setLeaderboard(data)

      // Use server-provided cache expiration time
      const serverExpireTime = response.headers['x-cache-expire']
      let expireTime
      let remaining

      if (serverExpireTime) {
        expireTime = parseInt(serverExpireTime)
        remaining = Math.max(0, Math.floor((expireTime - Date.now()) / 1000))
      } else {
        // Fallback if header not present
        expireTime = Date.now() + 5 * 60 * 1000
        remaining = 300
      }

      // Update cache for this tab
      setTabCache(prev => ({
        ...prev,
        [activeTab]: { data, expireTime }
      }))

      setTimeRemaining(remaining)
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

