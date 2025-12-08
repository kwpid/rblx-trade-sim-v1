import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { useNotifications } from '../contexts/NotificationContext'
import './Catalog.css'

const Catalog = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState(null)
  const { showPopup } = useNotifications()

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/items')
      setItems(response.data)
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async (itemId) => {
    try {
      await axios.post('/api/marketplace/purchase', { item_id: itemId })
      showPopup('Item purchased successfully!', 'success')
      fetchItems()
      // Refresh user cash
      setTimeout(() => window.location.reload(), 1000)
    } catch (error) {
      showPopup(error.response?.data?.error || 'Failed to purchase item', 'error')
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="catalog">
      <div className="container">
        <h1>Catalog</h1>
        <div className="catalog-grid">
          {items.map(item => (
            <Link key={item.id} to={`/catalog/${item.id}`} className="catalog-item-card">
              <div className="item-image-wrapper">
                <img 
                  src={item.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`} 
                  alt={item.name}
                  onError={(e) => {
                    e.target.src = `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`
                  }}
                />
                {item.is_limited && <span className="limited-badge-overlay">LIMITED</span>}
              </div>
              <div className="item-details">
                <h3>{item.name}</h3>
                <div className="item-meta">
                  <div className="item-price">${item.current_price?.toLocaleString()}</div>
                  {item.is_limited && <span className="limited-badge">LIMITED</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Catalog

