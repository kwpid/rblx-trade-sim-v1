import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import './Players.css'

const Players = () => {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPlayers()
  }, [])

  const fetchPlayers = async () => {
    try {
      const response = await axios.get('/api/users')
      setPlayers(response.data)
    } catch (error) {
      console.error('Error fetching players:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="players">
      <div className="container">
        <h1>Players</h1>
        <div className="players-list">
          {players.map(player => (
            <Link key={player.id} to={`/players/${player.id}`} className="player-card">
              <div className="player-info">
                <div className="player-username">{player.username}</div>
                <div className="player-cash">R${player.cash?.toLocaleString()}</div>
              </div>
              <div className="player-joined">
                Joined {new Date(player.created_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Players

