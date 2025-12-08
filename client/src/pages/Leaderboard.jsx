import { useEffect, useState } from 'react'
import axios from 'axios'
import './Leaderboard.css'

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get('/api/users/leaderboard')
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

  return (
    <div className="leaderboard">
      <div className="container">
        <h1>Leaderboard</h1>
        <div className="leaderboard-table">
          <div className="leaderboard-header">
            <div className="rank-col">Rank</div>
            <div className="username-col">Username</div>
            <div className="cash-col">Cash</div>
          </div>
          {leaderboard.map((player, index) => (
            <div key={player.id} className="leaderboard-row">
              <div className="rank-col">
                <span className={`rank ${index < 3 ? `rank-${index + 1}` : ''}`}>
                  {index + 1}
                </span>
              </div>
              <div className="username-col">{player.username}</div>
              <div className="cash-col">R${player.cash?.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Leaderboard

