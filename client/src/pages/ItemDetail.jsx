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
  const { showPopup } = useNotifications()

  useEffect(() => {
    fetchItemDetails()
  }, [id])

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
      
      if (user) {
        try {
          const inventoryResponse = await axios.get('/api/users/me/inventory')
          const owned = inventoryResponse.data.filter(i => i.item_id === id)
          setOwnedItems(owned)
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
  
  const imageUrl = `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`

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
            <img 
              src={imageUrl} 
              alt={item.name}
            />
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
                {ownedItems.length > 0 && (
                  <div className="item-owned-count">Item Owned ({ownedItems.length})</div>
                )}
                
                <div className="item-stats-grid">
                  <span className="stat-label">Best Price</span>
                  <span className="stat-value price">
                    {displayPrice()}
                  </span>
                  
                  <span className="stat-label">RAP</span>
                  <span className="stat-value">${currentRAP.toLocaleString()}</span>
                  
                  <span className="stat-label">Value</span>
                  <span className="stat-value">${itemValue.toLocaleString()}</span>
                  
                  <span className="stat-label">Owners</span>
                  <span className="stat-value">{ownerCount}</span>
                  
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
                  {ownedItems.map((ownedItem, index) => {
                    // Get serial number based on creation order
                    const serialNumber = index + 1
                    return (
                      <option key={ownedItem.id} value={ownedItem.id}>
                        Serial #{serialNumber} {ownedItem.is_for_sale ? '(Already Listed)' : ''}
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
