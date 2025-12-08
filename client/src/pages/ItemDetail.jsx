import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import './ItemDetail.css'

const ItemDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [item, setItem] = useState(null)
  const [rapHistory, setRapHistory] = useState([])
  const [resellers, setResellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [ownedCount, setOwnedCount] = useState(0)
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
      const sortedResellers = resellersResponse.data.sort((a, b) => 
        (a.sale_price || 0) - (b.sale_price || 0)
      )
      setResellers(sortedResellers)
      
      if (user) {
        try {
          const inventoryResponse = await axios.get('/api/users/me/inventory')
          const owned = inventoryResponse.data.filter(i => i.item_id === parseInt(id))
          setOwnedCount(owned.length)
        } catch (e) {
          console.error('Error fetching inventory:', e)
        }
      }
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
      fetchItemDetails()
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
    return (
      <div className="item-detail">
        <div className="container not-found">
          <h2>Item not found</h2>
          <p>The item you're looking for doesn't exist.</p>
          <Link to="/catalog" className="back-link">← Back to Catalog</Link>
        </div>
      </div>
    )
  }

  const bestPrice = resellers.length > 0 ? resellers[0].sale_price : null
  const hasResellers = resellers.length > 0
  const canPurchase = item.is_limited ? hasResellers : !item.is_off_sale

  const chartData = rapHistory.map(h => ({
    date: new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: h.rap_value
  }))

  const getDemandLevel = (item) => {
    if (item.demand >= 80) return 'Amazing'
    if (item.demand >= 60) return 'High'
    if (item.demand >= 40) return 'Normal'
    if (item.demand >= 20) return 'Low'
    return 'Terrible'
  }

  const getTrendLevel = (item) => {
    if (item.trend > 0) return 'Rising'
    if (item.trend < 0) return 'Lowering'
    return 'Stable'
  }

  return (
    <div className="item-detail">
      <div className="container">
        <Link to="/catalog" className="back-link">← Back to Catalog</Link>
        
        <div className="item-main-section">
          <div className="item-image-container">
            <img src={item.image_url} alt={item.name} />
            {item.is_limited && (
              <div className="item-limited-badge">
                <span className="item-limited-tag">LIMITED</span>
                <span className="item-limited-u-tag">U</span>
              </div>
            )}
          </div>
          
          <div className="item-info-panel">
            <div className="item-info-header">
              <div className="item-info-left">
                <h1 className="item-title">{item.name}</h1>
                <div className="item-creator">By Roblox</div>
                {ownedCount > 0 && (
                  <div className="item-owned-count">Item Owned ({ownedCount})</div>
                )}
                
                <div className="item-stats-grid">
                  <span className="stat-label">Best Price</span>
                  <span className="stat-value price">
                    {item.is_limited 
                      ? (hasResellers ? `$${bestPrice?.toLocaleString()}` : 'No Resellers')
                      : `$${item.current_price?.toLocaleString()}`
                    }
                  </span>
                  
                  {item.is_limited && (
                    <>
                      <span className="stat-label">Value</span>
                      <span className="stat-value">{item.value?.toLocaleString() || 'N/A'}</span>
                      
                      <span className="stat-label">Demand</span>
                      <span className="stat-value">{getDemandLevel(item)}</span>
                      
                      <span className="stat-label">Trend</span>
                      <span className="stat-value">{getTrendLevel(item)}</span>
                    </>
                  )}
                  
                  <span className="stat-label">Type</span>
                  <span className="stat-value">{item.category || 'Accessory | Hat'}</span>
                  
                  <span className="stat-label">Description</span>
                  <span className="stat-value">{item.description || 'No description available.'}</span>
                </div>
              </div>
              
              <div className="item-actions">
                {canPurchase ? (
                  <button 
                    className="buy-btn" 
                    onClick={item.is_limited && hasResellers ? () => handlePurchaseFromPlayer(resellers[0].id) : handlePurchase}
                  >
                    Buy
                  </button>
                ) : (
                  <div className="no-resellers-text">No Resellers</div>
                )}
                {item.is_limited && ownedCount > 0 && (
                  <button className="sell-btn" onClick={() => navigate('/profile')}>
                    Sell
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {item.is_limited && chartData.length > 0 && (
          <div className="chart-section">
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-dot price"></span>
                <span>Avg Price</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot volume"></span>
                <span>Volume</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00b06f" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00b06f" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#8c8c8c', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#8c8c8c', fontSize: 12 }}
                  tickFormatter={(value) => value.toLocaleString()}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#232527', 
                    border: '1px solid #3d3f41',
                    borderRadius: '8px',
                    color: '#f5f5f5'
                  }}
                  formatter={(value) => [`$${value.toLocaleString()}`, 'RAP']}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#00b06f" 
                  strokeWidth={2}
                  fill="url(#colorValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {item.is_limited && (
          <div className="resellers-section">
            <h2 className="resellers-title">Resellers</h2>
            {resellers.length === 0 ? (
              <div className="no-resellers-message">No resellers available</div>
            ) : (
              <div className="resellers-list">
                {resellers.map(reseller => (
                  <div key={reseller.id} className="reseller-item">
                    <div className="reseller-info">
                      <div className="reseller-username">{reseller.users?.username || 'Unknown'}</div>
                      <div className="reseller-price">${reseller.sale_price?.toLocaleString()}</div>
                    </div>
                    {reseller.user_id !== user?.id && (
                      <button
                        className="reseller-buy-btn"
                        onClick={() => handlePurchaseFromPlayer(reseller.id)}
                      >
                        Buy
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
  )
}

export default ItemDetail
