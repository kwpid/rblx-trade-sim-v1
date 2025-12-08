import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNotifications } from '../contexts/NotificationContext'
import './Deals.css'

const Deals = () => {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const { showPopup } = useNotifications()

  useEffect(() => {
    fetchDeals()
  }, [])

  const fetchDeals = async () => {
    try {
      // Get all items that are for sale by players
      const items = await axios.get('/api/items')
      const allDeals = []
      
      for (const item of items.data) {
        if (item.is_limited) {
          const resellers = await axios.get(`/api/items/${item.id}/resellers`)
          resellers.data.forEach(reseller => {
            allDeals.push({
              ...item,
              seller: reseller.users,
              salePrice: reseller.sale_price
            })
          })
        }
      }
      
      // Sort by price
      allDeals.sort((a, b) => a.salePrice - b.salePrice)
      setDeals(allDeals)
    } catch (error) {
      console.error('Error fetching deals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async (userItemId) => {
    try {
      await axios.post('/api/marketplace/purchase-from-player', {
        user_item_id: userItemId
      })
      showPopup('Item purchased successfully!', 'success')
      fetchDeals()
      setTimeout(() => window.location.reload(), 1000)
    } catch (error) {
      showPopup(error.response?.data?.error || 'Failed to purchase item', 'error')
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="deals">
      <div className="container">
        <h1>Deals</h1>
        <p className="deals-description">Browse limited items for sale by other players</p>
        {deals.length === 0 ? (
          <div className="empty-deals">No deals available</div>
        ) : (
          <div className="deals-grid">
            {deals.map((deal, index) => (
              <div key={index} className="deal-card">
                <img src={deal.image_url} alt={deal.name} />
                <div className="deal-info">
                  <h3>{deal.name}</h3>
                  <div className="deal-seller">Seller: {deal.seller?.username}</div>
                  <div className="deal-price">R${deal.salePrice?.toLocaleString()}</div>
                  <button
                    className="btn"
                    onClick={() => handlePurchase(deal.id)}
                  >
                    Purchase
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Deals

