import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import './Dashboard.css'

const Dashboard = () => {
  const [recentItems, setRecentItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentItems()
  }, [])

  const fetchRecentItems = async () => {
    try {
      const response = await axios.get('/api/items?limit=6')
      setRecentItems(response.data)
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dashboard">
      <div className="container">
        <h1>Welcome to Roblox Trade Simulator</h1>
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h2>Recent Items</h2>
            {loading ? (
              <div className="loading"><div className="spinner"></div></div>
            ) : (
              <div className="items-grid">
                {recentItems.map(item => (
                  <Link key={item.id} to={`/catalog`} className="item-card-small">
                    <img src={item.image_url} alt={item.name} />
                    <div className="item-info">
                      <div className="item-name">{item.name}</div>
                      <div className="item-price">R${item.current_price?.toLocaleString()}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="dashboard-card">
            <h2>Quick Links</h2>
            <div className="quick-links">
              <Link to="/catalog" className="quick-link">Browse Catalog</Link>
              <Link to="/trade" className="quick-link">Start Trading</Link>
              <Link to="/leaderboard" className="quick-link">View Leaderboard</Link>
              <Link to="/profile" className="quick-link">My Profile</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard

