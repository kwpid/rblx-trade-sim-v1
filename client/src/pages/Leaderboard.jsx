import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import './Leaderboard.css'

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('value') // 'value' or 'rap'

  useEffect(() => {
    fetchLeaderboard()
  }, [activeTab])

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

  return (
    <div className="leaderboard">
      <div className="container">
        <h1>Leaderboard</h1>
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
                <Link to={`/profile/${player.id}`} className="leaderboard-link">
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

