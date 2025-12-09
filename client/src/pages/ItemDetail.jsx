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

  // Calculate fee breakdown
  const calculateFees = (price) => {
    if (!price || isNaN(price) || price <= 0) {
      return { sellerAmount: 0, adminFee: 0, total: 0 }
    }
    const numPrice = Math.floor(parseFloat(price))
    const sellerAmount = Math.floor(numPrice * 0.8) // 80% to seller
    const adminFee = numPrice - sellerAmount // 20% to admin
    return { sellerAmount, adminFee, total: numPrice }
  }


  useEffect(() => {
    fetchItemDetails()
  }, [id])

  useEffect(() => {
    // Fetch owned items for this specific item only (more efficient)
    const fetchOwned = async () => {
      if (!user || !id) {
        setOwnedItems([])
        return
      }
      try {
        // Use the more efficient endpoint that only checks this specific item
        const response = await axios.get(`/api/users/me/owns/${id}`, {
          validateStatus: (status) => status < 500 // Don't throw on 401/403
        })
        
        // Check if response is successful
        if (response.status === 200 && response.data) {
          setOwnedItems(response.data || [])
        } else {
          // If not authenticated or other client error, just set empty array
          setOwnedItems([])
        }
      } catch (e) {
        // Only log if it's a server error (500), not auth errors
        if (e.response?.status >= 500) {
          console.error('Error checking ownership:', e)
        }
        setOwnedItems([])
      }
    }
    fetchOwned()
  }, [user, id])

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

  // For best price display, include all resellers (including own listings)
  // But for purchasing, filter out own items
  const bestPrice = resellers.length > 0 ? resellers[0].sale_price : null
  const hasResellers = resellers.length > 0
  
  // Filter out user's own items from resellers for purchasing
  const availableResellers = user ? resellers.filter(r => 
    !ownedItems.some(owned => owned.id === r.id)
  ) : resellers
  
  const hasAvailableResellers = availableResellers.length > 0
  const isOutOfStock = item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0)
  // Users can buy from resellers even if they own a copy (buy limit only applies to original price purchases)
  const canPurchase = item.is_limited ? hasAvailableResellers : !isOutOfStock || hasAvailableResellers
  
  // Get RAP (most recent from history or current price)
  const currentRAP = rapHistory.length > 0 ? rapHistory[rapHistory.length - 1].rap_value : (item.current_price || 0)
  // Only use item.value if it's explicitly set (not null/undefined), otherwise use 0
  const itemValue = (item.value !== null && item.value !== undefined) ? item.value : 0
  
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
    // Check if item is limited
    if (!item?.is_limited) {
      showPopup('Only limited items can be sold on the marketplace', 'error')
      return
    }

    if (!selectedSerialForSale || !salePrice || salePrice <= 0) {
      showPopup('Please select a serial and enter a valid price', 'error')
      return
    }
    
    // Ensure no decimals
    const price = Math.floor(parseFloat(salePrice))
    if (price <= 0 || isNaN(price)) {
      showPopup('Please enter a valid whole number price', 'error')
      return
    }
    
    try {
      await axios.post('/api/marketplace/list', {
        user_item_id: selectedSerialForSale,
        sale_price: price
      })
      showPopup('Item listed for sale!', 'success')
      setShowSellDialog(false)
      setSelectedSerialForSale(null)
      setSalePrice('')
      fetchItemDetails()
      // Refetch owned items for this specific item
      try {
        const response = await axios.get(`/api/users/me/owns/${id}`)
        setOwnedItems(response.data || [])
      } catch (e) {
        // If refetch fails, just continue - the item details will refresh
        console.error('Error refetching owned items:', e)
      }
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
                      if (item.is_limited && availableResellers.length > 0) {
                        confirmPurchase(true, availableResellers[0].id)
                      } else if (isOutOfStock && availableResellers.length > 0) {
                        confirmPurchase(true, availableResellers[0].id)
                      } else if (!item.is_limited && !isOutOfStock) {
                        confirmPurchase(false, null)
                      }
                    }}
                  >
                    Buy {bestPrice ? `$${bestPrice.toLocaleString()}` : `$${item.current_price?.toLocaleString()}`}
                  </button>
                ) : (
                  <div className="no-resellers-text">No Resellers</div>
                )}
                {ownedItems.length > 0 && item?.is_limited && (
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
              {resellers.map(reseller => {
                // Check if this reseller item is owned by the current user
                const isOwnItem = user && ownedItems.some(owned => owned.id === reseller.id)
                
                return (
                  <div key={reseller.id} className="reseller-item">
                    <div className="reseller-info">
                      <div className="reseller-username">{reseller.users?.username || 'Unknown'}</div>
                      <div className="reseller-serial">Serial #{reseller.serial_number || 'N/A'}</div>
                      <div className="reseller-price">${reseller.sale_price?.toLocaleString()}</div>
                    </div>
                    {isOwnItem ? (
                      <button
                        className="reseller-buy-btn"
                        onClick={async () => {
                          try {
                            await axios.post('/api/marketplace/list', {
                              user_item_id: reseller.id,
                              sale_price: null
                            })
                            showPopup('Item unlisted', 'success')
                            fetchItemDetails()
                            // Refetch owned items
                            try {
                              const response = await axios.get(`/api/users/me/owns/${id}`)
                              setOwnedItems(response.data || [])
                            } catch (e) {
                              console.error('Error refetching owned items:', e)
                            }
                          } catch (error) {
                            showPopup(error.response?.data?.error || 'Failed to unlist item', 'error')
                          }
                        }}
                      >
                        Unlist
                      </button>
                    ) : (
                      <button
                        className="reseller-buy-btn"
                        onClick={() => confirmPurchase(true, reseller.id)}
                      >
                        Buy
                      </button>
                    )}
                  </div>
                )
              })}
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
              <h3>{selectedSerialForSale && ownedItems.find(i => i.id === selectedSerialForSale)?.is_for_sale ? 'Update Sale Price' : 'List Item for Sale'}</h3>
              {!item?.is_limited && (
                <div style={{ padding: '12px', marginBottom: '16px', backgroundColor: '#ff6b6b20', border: '1px solid #ff6b6b', borderRadius: '6px', color: '#ff6b6b', fontSize: '14px' }}>
                  Only limited items can be sold on the marketplace.
                </div>
              )}
              <div className="form-group">
                <label>Select Serial</label>
                <select
                  className="input"
                  value={selectedSerialForSale || ''}
                  onChange={(e) => {
                    const selectedItem = ownedItems.find(i => i.id === e.target.value)
                    setSelectedSerialForSale(e.target.value)
                    // Pre-fill price if item is already listed
                    if (selectedItem?.is_for_sale && selectedItem?.sale_price) {
                      setSalePrice(selectedItem.sale_price.toString())
                    } else {
                      setSalePrice('')
                    }
                  }}
                  disabled={!item?.is_limited}
                >
                  <option value="">Select a serial...</option>
                  {ownedItems
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                    .map((ownedItem, index) => {
                      // Get serial number based on creation order (all items of this type, not just owned)
                      const serialNumber = index + 1
                      const isListed = ownedItem.is_for_sale
                      return (
                        <option key={ownedItem.id} value={ownedItem.id}>
                          Serial #{serialNumber} {isListed ? `(Listed: $${ownedItem.sale_price?.toLocaleString()})` : ''}
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
                  onChange={(e) => {
                    const value = e.target.value
                    // Only allow whole numbers (no decimals)
                    if (value === '' || (!isNaN(value) && !value.includes('.'))) {
                      setSalePrice(value)
                    }
                  }}
                  min="1"
                  step="1"
                  placeholder="Enter price"
                  disabled={!item?.is_limited}
                />
                {salePrice && !isNaN(salePrice) && parseFloat(salePrice) > 0 && (
                  <div className="price-preview" style={{ marginTop: '12px', padding: '12px', backgroundColor: '#2a2d2f', borderRadius: '6px', fontSize: '14px' }}>
                    <div style={{ marginBottom: '8px', color: '#b0b0b0' }}>Price Breakdown:</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#8c8c8c' }}>List Price:</span>
                      <span style={{ color: '#f5f5f5', fontWeight: '600' }}>${Math.floor(parseFloat(salePrice)).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#8c8c8c' }}>You Receive (80%):</span>
                      <span style={{ color: '#00b06f', fontWeight: '600' }}>${calculateFees(salePrice).sellerAmount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #3d3f41', paddingTop: '8px', marginTop: '8px' }}>
                      <span style={{ color: '#8c8c8c' }}>Marketplace Fee (20%):</span>
                      <span style={{ color: '#ff6b6b', fontWeight: '600' }}>-${calculateFees(salePrice).adminFee.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="confirm-dialog-actions">
                <button 
                  className="confirm-btn" 
                  onClick={handleSell}
                  disabled={!item?.is_limited}
                >
                  {selectedSerialForSale && ownedItems.find(i => i.id === selectedSerialForSale)?.is_for_sale ? 'Update Price' : 'List for Sale'}
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
