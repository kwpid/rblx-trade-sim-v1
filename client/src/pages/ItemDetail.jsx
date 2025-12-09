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
  const [ownerCount, setOwnerCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [ownedItems, setOwnedItems] = useState([])
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [showSellDialog, setShowSellDialog] = useState(false)
  const [selectedSerialForSale, setSelectedSerialForSale] = useState(null)
  const [salePrice, setSalePrice] = useState('')
  const [timeRemaining, setTimeRemaining] = useState(null)
  const { showPopup } = useNotifications()


  useEffect(() => {
    fetchItemDetails()
  }, [id])

  useEffect(() => {
    // Fetch owned items separately when user or id changes
    // Also refetch when item changes (in case item loads after user check)
    const fetchOwned = async () => {
      if (!user || !id) {
        setOwnedItems([])
        return
      }
      try {
        const inventoryResponse = await axios.get('/api/users/me/inventory')
        
        // Show all owned items (including ones already for sale) - user can resell limited items
        // Use String() to ensure proper comparison in case of UUID format differences
        // Also try comparing with item.id from the nested items object
        const owned = inventoryResponse.data.filter(i => {
          const itemIdMatch = String(i.item_id) === String(id)
          const nestedIdMatch = i.items && String(i.items.id) === String(id)
          return itemIdMatch || nestedIdMatch
        })
        setOwnedItems(owned)
      } catch (e) {
        console.error('Error fetching inventory:', e)
        setOwnedItems([])
      }
    }
    fetchOwned()
  }, [user, id, item])

  // Timer countdown for timer items
  useEffect(() => {
    if (!item || item.is_limited || item.is_off_sale || item.sale_type !== 'timer' || !item.sale_end_time) {
      setTimeRemaining(null)
      return
    }

    const updateTimer = () => {
      const now = new Date()
      const endTime = new Date(item.sale_end_time)
      const diff = endTime - now

      if (diff <= 0) {
        setTimeRemaining(null)
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`)
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes}m ${seconds}s`)
      } else {
        setTimeRemaining(`${seconds}s`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [item])

  const fetchItemDetails = async () => {
    try {
      const [itemResponse, rapResponse, resellersResponse, ownersResponse] = await Promise.all([
        axios.get(`/api/items/${id}`),
        axios.get(`/api/items/${id}/rap-history`),
        axios.get(`/api/items/${id}/resellers`),
        axios.get(`/api/items/${id}/owners`)
      ])
      setItem(itemResponse.data)
      setRapHistory(rapResponse.data)
      const sortedResellers = resellersResponse.data.sort((a, b) => 
        (a.sale_price || 0) - (b.sale_price || 0)
      )
      setResellers(sortedResellers)
      setOwnerCount(ownersResponse.data.count || 0)
    } catch (error) {
      console.error('Error fetching item details:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
    setShowConfirmDialog(false)
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
    setShowConfirmDialog(false)
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

  const confirmPurchase = (isFromPlayer, userItemId) => {
    setConfirmAction(() => () => isFromPlayer ? handlePurchaseFromPlayer(userItemId) : handlePurchase())
    setShowConfirmDialog(true)
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
  const isOutOfStock = item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0)
  const canPurchase = item.is_limited ? hasResellers : !isOutOfStock || hasResellers
  
  // Get RAP (most recent from history or current price)
  const currentRAP = rapHistory.length > 0 ? rapHistory[rapHistory.length - 1].rap_value : (item.current_price || 0)
  const itemValue = item.value || item.current_price || 0
  
  const displayPrice = () => {
    if (item.is_limited) {
      return hasResellers ? `$${bestPrice?.toLocaleString()}` : 'No Resellers'
    }
    if (isOutOfStock) {
      return hasResellers ? `$${bestPrice?.toLocaleString()}` : 'No Resellers'
    }
    return `$${item.current_price?.toLocaleString()}`
  }
  
  const handleSell = async () => {
    if (!selectedSerialForSale || !salePrice || salePrice <= 0) {
      showPopup('Please select a serial and enter a valid price', 'error')
      return
    }
    
    try {
      await axios.post('/api/marketplace/list', {
        user_item_id: selectedSerialForSale,
        sale_price: parseFloat(salePrice)
      })
      showPopup('Item listed for sale!', 'success')
      setShowSellDialog(false)
      setSelectedSerialForSale(null)
      setSalePrice('')
      fetchItemDetails()
    } catch (error) {
      showPopup(error.response?.data?.error || 'Failed to list item', 'error')
    }
  }
  
  const imageUrl = item.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`

  const chartData = rapHistory.map(h => ({
    date: new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: h.rap_value
  }))

  const getDemandLevel = (item) => {
    const demand = item.demand
    if (demand === 'very_high') return 'Very High'
    if (demand === 'high') return 'High'
    if (demand === 'medium') return 'Medium'
    if (demand === 'low') return 'Low'
    if (demand === 'very_low') return 'Very Low'
    return 'Unknown'
  }

  const getTrendLevel = (item) => {
    const trend = item.trend
    if (trend === 'rising') return 'Rising'
    if (trend === 'declining') return 'Declining'
    return 'Stable'
  }

  return (
    <div className="item-detail">
      <div className="container">
        <Link to="/catalog" className="back-link">← Back to Catalog</Link>
        
        <div className="item-main-section">
          <div className="item-image-container">
            <img 
              src={imageUrl} 
              alt={item.name}
            />
            {item.is_limited && (
              <div className="item-limited-badge">
                <span className="item-limited-tag">LIMITED</span>
                {item.sale_type === 'stock' && <span className="item-limited-u-tag">U</span>}
              </div>
            )}
            {!item.is_limited && !item.is_off_sale && item.sale_type === 'timer' && new Date(item.sale_end_time) > new Date() && (
              <div className="item-timer-badge">
                {timeRemaining || 'Calculating...'}
              </div>
            )}
          </div>
          
          <div className="item-info-panel">
            <div className="item-info-header">
              <div className="item-info-left">
                <h1 className="item-title">{item.name}</h1>
                <div className="item-creator">By Roblox</div>
                {ownedItems.length > 0 && (
                  <div className="item-owned-count">Item Owned ({ownedItems.length})</div>
                )}
                
                <div className="item-stats-grid">
                  <span className="stat-label">Best Price</span>
                  <span className="stat-value price">
                    {displayPrice()}
                  </span>
                  
                  <span className="stat-label">RAP</span>
                  <span className="stat-value price-value">${currentRAP.toLocaleString()}</span>
                  
                  <span className="stat-label">Value</span>
                  <span className="stat-value price-value">${itemValue.toLocaleString()}</span>
                  
                  <span className="stat-label">Owners</span>
                  <span className="stat-value">{ownerCount}</span>
                  
                  {!item.is_limited && !item.is_off_sale && item.sale_type === 'stock' && (
                    <>
                      <span className="stat-label">Stock</span>
                      <span className="stat-value">{item.remaining_stock || 0} / {item.stock_count || 0}</span>
                    </>
                  )}
                  
                  {!item.is_limited && !item.is_off_sale && item.sale_type === 'timer' && timeRemaining && (
                    <>
                      <span className="stat-label">Time Remaining</span>
                      <span className="stat-value">{timeRemaining}</span>
                    </>
                  )}
                  
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
                    className="buy-btn buy-btn-large" 
                    onClick={() => {
                      if (item.is_limited && hasResellers) {
                        confirmPurchase(true, resellers[0].id)
                      } else if (isOutOfStock && hasResellers) {
                        confirmPurchase(true, resellers[0].id)
                      } else {
                        confirmPurchase(false, null)
                      }
                    }}
                  >
                    Buy {bestPrice ? `$${bestPrice.toLocaleString()}` : `$${item.current_price?.toLocaleString()}`}
                  </button>
                ) : (
                  <div className="no-resellers-text">No Resellers</div>
                )}
                {ownedItems.length > 0 && (
                  <button className="sell-btn" onClick={() => setShowSellDialog(true)}>
                    Sell
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>


        {chartData.length > 0 && (
          <div className="chart-section">
            <h2 className="chart-title">RAP History</h2>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-dot price"></span>
                <span>Avg Price</span>
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
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
                    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
                    return `$${value.toLocaleString()}`
                  }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#232527', 
                    border: '1px solid #3d3f41',
                    borderRadius: '8px',
                    color: '#f5f5f5'
                  }}
                  formatter={(value) => [`$${typeof value === 'number' ? value.toLocaleString() : value}`, 'RAP']}
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
                    <div className="reseller-serial">Serial #{reseller.serial_number || 'N/A'}</div>
                    <div className="reseller-price">${reseller.sale_price?.toLocaleString()}</div>
                  </div>
                  <button
                    className="reseller-buy-btn"
                    onClick={() => confirmPurchase(true, reseller.id)}
                  >
                    Buy
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {showConfirmDialog && (
          <div className="confirm-dialog-overlay" onClick={() => setShowConfirmDialog(false)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Confirm Purchase</h3>
              <p>Are you sure you want to purchase this item?</p>
              <div className="confirm-dialog-actions">
                <button className="confirm-btn" onClick={() => confirmAction && confirmAction()}>
                  Confirm
                </button>
                <button className="cancel-btn" onClick={() => setShowConfirmDialog(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showSellDialog && (
          <div className="confirm-dialog-overlay" onClick={() => setShowSellDialog(false)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>List Item for Sale</h3>
              <div className="form-group">
                <label>Select Serial</label>
                <select
                  className="input"
                  value={selectedSerialForSale || ''}
                  onChange={(e) => setSelectedSerialForSale(e.target.value)}
                >
                  <option value="">Select a serial...</option>
                  {ownedItems
                    .filter(item => !item.is_for_sale) // Only show items not already listed
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                    .map((ownedItem, index) => {
                      // Get serial number based on creation order (all items of this type, not just owned)
                      const serialNumber = index + 1
                      return (
                        <option key={ownedItem.id} value={ownedItem.id}>
                          Serial #{serialNumber}
                        </option>
                      )
                    })}
                </select>
              </div>
              <div className="form-group">
                <label>Sale Price (R$)</label>
                <input
                  type="number"
                  className="input"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  min="1"
                  step="1"
                  placeholder="Enter price"
                />
              </div>
              <div className="confirm-dialog-actions">
                <button className="confirm-btn" onClick={handleSell}>
                  List for Sale
                </button>
                <button className="cancel-btn" onClick={() => {
                  setShowSellDialog(false)
                  setSelectedSerialForSale(null)
                  setSalePrice('')
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ItemDetail
