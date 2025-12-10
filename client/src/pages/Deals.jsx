import { useState, useEffect } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import './Deals.css'

const Deals = () => {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDeals()
  }, [])

  const fetchDeals = async () => {
    try {
      // Fetch items that are below RAP
      const response = await axios.get('/api/marketplace/deals')
      setDeals(response.data)
    } catch (error) {
      console.error('Error fetching deals:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateDealPercentage = (price, rap) => {
    if (!rap || rap === 0) return 0
    return Math.round(((rap - price) / rap) * 100)
  }

  return (
    <div className="deals-page">
      <div className="deals-header">
        {/* Header buttons placeholder as per image - functionality can be added later if needed */}
        <div className="deals-filters">
          <button className="filter-btn">Hide Projecteds</button>
          <button className="filter-btn">Calculate by Value</button>
          <button className="filter-btn">Hide Below 10%</button>
          <button className="filter-btn active">Relevance</button>
        </div>
      </div>

      <div className="deals-grid">
        {loading ? (
          <div className="loading">Loading deals...</div>
        ) : deals.length === 0 ? (
          <div className="no-deals">No deals found right now. Check back later!</div>
        ) : (
          deals.map(deal => {
            const dealPercent = calculateDealPercentage(deal.price, deal.rap)
            return (
              <Link to={`/catalog/${deal.item_id}`} key={deal.id} className="deal-card">
                <div className="deal-header-bg" style={{ backgroundColor: getRarityColor(deal.rarity) }}>
                  <span className="deal-item-name">{deal.item_name}</span>
                </div>
                <div className="deal-content">
                  <div className="deal-image">
                    <img src={deal.image_url} alt={deal.item_name} />
                  </div>
                  <div className="deal-stats">
                    <div className="stat-row">
                      <span className="stat-label">Price</span>
                      <span className="stat-value">{deal.price.toLocaleString()}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">RAP</span>
                      <span className="stat-value">{deal.rap.toLocaleString()}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Deal</span>
                      <span className="stat-value deal-percent">{dealPercent}%</span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}

// Helper for card header color (placeholder logic)
const getRarityColor = (rarity) => {
  // You can implement actual rarity logic here
  return '#393b3d'
}

export default Deals
