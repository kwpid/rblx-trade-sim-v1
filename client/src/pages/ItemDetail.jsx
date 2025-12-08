import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './ItemDetail.css'

const ItemDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [item, setItem] = useState(null)
  const [rapHistory, setRapHistory] = useState([])
  const [resellers, setResellers] = useState([])
  const [loading, setLoading] = useState(true)
  const { showPopup } = useNotifications()

  useEffect(() => {
    fetchItemDetails()
  }, [id])

  const fetchItemDetails = async () => {
    try {
      const [itemResponse, rapResponse, resellersResponse] = await Promise.all([
        axios.get(`/api/items/${id}`),
        axios.get(`/api/items/${id}/rap-history`),
        axios.get(`/api/items/${id}/resellers`)
      ])
      setItem(itemResponse.data)
      setRapHistory(rapResponse.data)
      setResellers(resellersResponse.data)
    } catch (error) {
      console.error('Error fetching item details:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
    try {
      await axios.post('/api/marketplace/purchase', { item_id: id })
      showPopup('Item purchased successfully!', 'success')
      navigate('/profile')
      setTimeout(() => window.location.reload(), 1000)
    } catch (error) {
      showPopup(error.response?.data?.error || 'Failed to purchase item', 'error')
    }
  }

  const handlePurchaseFromPlayer = async (userItemId) => {
    try {
      await axios.post('/api/marketplace/purchase-from-player', {
        user_item_id: userItemId
      })
      showPopup('Item purchased successfully!', 'success')
      fetchItemDetails()
      setTimeout(() => window.location.reload(), 1000)
    } catch (error) {
      showPopup(error.response?.data?.error || 'Failed to purchase item', 'error')
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  if (!item) {
    return <div className="item-detail"><div className="container">Item not found</div></div>
  }

  return (
    <div className="item-detail">
      <div className="container">
        <button className="back-btn" onClick={() => navigate('/catalog')}>
          ← Back to Catalog
        </button>
        <div className="item-detail-content">
          <div className="item-main">
            <img src={item.image_url} alt={item.name} className="item-image" />
            <div className="item-info-main">
              <h1>{item.name}</h1>
              <p className="item-description">{item.description || 'No description available'}</p>
              <div className="item-price-main">R${item.current_price?.toLocaleString()}</div>
              {item.is_limited && <span className="limited-badge">LIMITED</span>}
              {!item.is_limited && !item.is_off_sale && (
                <button className="btn" onClick={handlePurchase}>
                  Purchase
                </button>
              )}
            </div>
          </div>
          <div className="item-details-section">
            <div className="card">
              <h2>RAP History</h2>
              {rapHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={rapHistory.map(h => ({
                    ...h,
                    timestamp: new Date(h.timestamp).toLocaleDateString()
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="rap_value" stroke="#00a2ff" name="RAP" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p>No RAP history available</p>
              )}
            </div>
            {item.is_limited && (
              <div className="card">
                <h2>Resellers</h2>
                {resellers.length === 0 ? (
                  <p>No resellers available</p>
                ) : (
                  <div className="resellers-list">
                    {resellers.map(reseller => (
                      <div key={reseller.id} className="reseller-item">
                        <div>
                          <div className="reseller-username">{reseller.users?.username}</div>
                          <div className="reseller-price">R${reseller.sale_price?.toLocaleString()}</div>
                        </div>
                        {reseller.user_id !== user?.id && (
                          <button
                            className="btn"
                            onClick={() => handlePurchaseFromPlayer(reseller.id)}
                          >
                            Purchase
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ItemDetail

