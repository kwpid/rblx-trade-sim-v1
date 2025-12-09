import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useNotifications } from '../contexts/NotificationContext'
import './Profile.css'

const Profile = () => {
  const { id } = useParams()
  const { user } = useAuth()
  const [profileUser, setProfileUser] = useState(null)
  const [inventory, setInventory] = useState([])
  const [resellerPrices, setResellerPrices] = useState({})
  const [rapValues, setRapValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [portfolioData, setPortfolioData] = useState([])
  const [portfolioLoading, setPortfolioLoading] = useState(true)
  const { showPopup } = useNotifications()

  const userId = id || user?.id

  useEffect(() => {
    if (userId) {
      fetchUserProfile()
      fetchInventory()
      fetchPortfolioData()
    }
  }, [userId])

  const fetchUserProfile = async () => {
    try {
      const response = await axios.get(`/api/users/${userId}`)
      setProfileUser(response.data)
    } catch (error) {
      console.error('Error fetching user profile:', error)
    }
  }

  const fetchInventory = async () => {
    try {
      const response = await axios.get(`/api/users/${userId}/inventory`)
      const items = response.data
      setInventory(items)
      
      // Fetch reseller prices for out-of-stock items
      const itemsNeedingResellers = items.filter(item => {
        const itemData = item.items
        if (!itemData) return false
        return itemData.is_limited || itemData.is_off_sale || 
          (itemData.sale_type === 'stock' && itemData.remaining_stock <= 0)
      })
      
      const pricePromises = itemsNeedingResellers.map(async (userItem) => {
        try {
          const res = await axios.get(`/api/items/${userItem.item_id}/resellers`)
          if (res.data && res.data.length > 0) {
            return { itemId: userItem.item_id, price: res.data[0].sale_price }
          }
          return { itemId: userItem.item_id, price: null }
        } catch (e) {
          return { itemId: userItem.item_id, price: null }
        }
      })
      
      const prices = await Promise.all(pricePromises)
      const priceMap = {}
      prices.forEach(({ itemId, price }) => {
        priceMap[itemId] = price
      })
      setResellerPrices(priceMap)

      // Fetch RAP history for all unique items to get current RAP
      const uniqueItemIds = [...new Set(inventory.map(item => item.item_id))]
      const rapPromises = uniqueItemIds.map(async (itemId) => {
        try {
          const res = await axios.get(`/api/items/${itemId}/rap-history`)
          if (res.data && res.data.length > 0) {
            // Get most recent RAP
            const latestRAP = res.data[res.data.length - 1].rap_value
            return { itemId, rap: latestRAP }
          }
          return { itemId, rap: null }
        } catch (e) {
          return { itemId, rap: null }
        }
      })
      
      const raps = await Promise.all(rapPromises)
      const rapMap = {}
      raps.forEach(({ itemId, rap }) => {
        rapMap[itemId] = rap
      })
      setRapValues(rapMap)
    } catch (error) {
      console.error('Error fetching inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPortfolioData = async () => {
    setPortfolioLoading(true)
    try {
      // Try to fetch snapshots first
      try {
        const snapshotsResponse = await axios.get(`/api/users/${userId}/snapshots`)
        const snapshots = snapshotsResponse.data || []
        
        if (snapshots.length > 0) {
          // Use snapshot data
          const data = snapshots.map(snapshot => ({
            date: new Date(snapshot.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: snapshot.total_value,
            rap: snapshot.total_rap
          }))
          
          setPortfolioData(data)
          setPortfolioLoading(false)
          return
        }
      } catch (snapshotError) {
        // If snapshots don't exist yet, fall back to calculating from inventory
        console.log('No snapshots available, calculating from inventory')
      }
      
      // Fallback: Calculate from current inventory (for backwards compatibility)
      const response = await axios.get(`/api/users/${userId}/inventory`)
      const items = response.data
      
      // Calculate current portfolio totals
      let currentValue = 0
      let currentRAP = 0
      
      // Get reseller prices for items that are limited or out of stock
      const itemIds = items.map(item => item.item_id)
      const resellerPriceMap = new Map()
      
      // Fetch reseller prices for each item
      const resellerPromises = itemIds.map(async (itemId) => {
        try {
          const res = await axios.get(`/api/items/${itemId}/resellers`)
          if (res.data && res.data.length > 0) {
            return { itemId, price: res.data[0].sale_price }
          }
          return { itemId, price: null }
        } catch (e) {
          return { itemId, price: null }
        }
      })
      
      const resellerResults = await Promise.all(resellerPromises)
      resellerResults.forEach(({ itemId, price }) => {
        if (price !== null) {
          resellerPriceMap.set(itemId, price)
        }
      })
      
      // Get RAP history for all items
      const rapPromises = itemIds.map(async (itemId) => {
        try {
          const res = await axios.get(`/api/items/${itemId}/rap-history`)
          if (res.data && res.data.length > 0) {
            return { itemId, rap: res.data[res.data.length - 1].rap_value }
          }
          return { itemId, rap: null }
        } catch (e) {
          return { itemId, rap: null }
        }
      })
      
      const rapResults = await Promise.all(rapPromises)
      const rapMap = new Map()
      rapResults.forEach(({ itemId, rap }) => {
        if (rap !== null) {
          rapMap.set(itemId, rap)
        }
      })
      
      items.forEach(userItem => {
        const itemData = userItem.items
        if (!itemData) return
        
        // Calculate value
        const isOutOfStock = itemData.is_off_sale || 
          (itemData.sale_type === 'stock' && itemData.remaining_stock <= 0)
        
        // Only use item.value if it's explicitly set (not null/undefined), otherwise start with 0
        let itemValue = (itemData.value !== null && itemData.value !== undefined) ? itemData.value : 0
        
        // If out of stock or limited, use reseller price if available
        if ((itemData.is_limited || isOutOfStock) && resellerPriceMap.has(userItem.item_id)) {
          itemValue = resellerPriceMap.get(userItem.item_id)
        }
        
        currentValue += itemValue
        
        // Calculate RAP
        const itemRAP = rapMap.get(userItem.item_id) || itemData.current_price || userItem.purchase_price || 0
        currentRAP += itemRAP
      })
      
      // If no snapshots, add current values as a single data point
      const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      setPortfolioData([{ date: today, value: currentValue, rap: currentRAP }])
    } catch (error) {
      console.error('Error fetching portfolio data:', error)
    } finally {
      setPortfolioLoading(false)
    }
  }


  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  // Calculate total value using item.value, reseller price, or current_price
  const totalValue = inventory.reduce((sum, item) => {
    const itemData = item.items
    if (!itemData) return sum
    
    // Check if item is out of stock or limited
    const isOutOfStock = itemData.is_off_sale || 
      (itemData.sale_type === 'stock' && itemData.remaining_stock <= 0)
    
    // Only use item.value if it's explicitly set (not null/undefined), otherwise start with 0
    let itemValue = (itemData.value !== null && itemData.value !== undefined) ? itemData.value : 0
    
    // If out of stock or limited, use reseller price if available
    if ((itemData.is_limited || isOutOfStock) && resellerPrices[item.item_id]) {
      itemValue = resellerPrices[item.item_id]
    }
    
    return sum + itemValue
  }, 0)
  
  // Calculate total RAP from most recent RAP history
  const totalRAP = inventory.reduce((sum, item) => {
    const itemRAP = item.items?.current_price || item.purchase_price || 0
    return sum + itemRAP
  }, 0)

  return (
    <div className="profile">
      <div className="container">
        {/* User Info Section */}
        <div className="profile-header">
          <div className="profile-user-info">
            <h1>{profileUser?.username || user?.username}</h1>
            <div className="profile-stats">
              <div className="stat-item">
                <span className="stat-label">Cash:</span>
                <span className="stat-value price-value">${(profileUser?.cash || user?.cash || 0)?.toLocaleString()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Portfolio Value:</span>
                <span className="stat-value price-value">${totalValue.toLocaleString()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">RAP:</span>
                <span className="stat-value price-value">${totalRAP.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RAP/Value Graph */}
        <div className="portfolio-graph card">
          {portfolioLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
              <div className="spinner"></div>
            </div>
          ) : portfolioData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={portfolioData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#4a4a4a" />
                <XAxis dataKey="date" stroke="#b0b0b0" />
                <YAxis 
                  stroke="#b0b0b0"
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
                    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
                    return `$${value.toLocaleString()}`
                  }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#393939', border: '1px solid #4a4a4a', borderRadius: '4px' }}
                  labelStyle={{ color: '#ffffff' }}
                  formatter={(value, name) => {
                    const formatted = typeof value === 'number' ? `$${value.toLocaleString()}` : value
                    return [formatted, name]
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#00a2ff" name="Value" dot={false} />
                <Line type="monotone" dataKey="rap" stroke="#00ff88" name="RAP" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </div>

        {/* Inventory Section */}
        <div className="inventory-section">
          <div className="inventory-header">
            <h2>Inventory</h2>
            <div className="inventory-controls">
              <button className="btn-secondary">Hide Serials</button>
              <input type="text" placeholder="Search" className="inventory-search" />
            </div>
          </div>
          {inventory.length === 0 ? (
            <div className="empty-inventory">No items in inventory</div>
          ) : (
            <div className="inventory-grid">
              {inventory
                .map((userItem) => {
                  // Calculate serial number based on creation order for this item
                  const sameItemInventory = inventory
                    .filter(item => item.item_id === userItem.item_id)
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                  const serialNumber = sameItemInventory.findIndex(item => item.id === userItem.id) + 1
                  
                  // Calculate item value - check if out of stock and use reseller price
                  const itemData = userItem.items
                  // Only use item.value if it's explicitly set (not null/undefined), otherwise start with 0
                  let itemValue = (itemData?.value !== null && itemData?.value !== undefined) ? itemData.value : 0
                  
                  if (itemData) {
                    const isOutOfStock = itemData.is_off_sale || 
                      (itemData.sale_type === 'stock' && itemData.remaining_stock <= 0)
                    
                    // If out of stock or limited, use reseller price if available
                    if ((itemData.is_limited || isOutOfStock) && resellerPrices[userItem.item_id]) {
                      itemValue = resellerPrices[userItem.item_id]
                    }
                  }
                  
                  // Get RAP for sorting (use most recent RAP, or fallback to current_price or purchase_price)
                  const itemRAP = rapValues[userItem.item_id] || itemData?.current_price || userItem.purchase_price || 0
                  
                  return {
                    ...userItem,
                    calculatedValue: itemValue,
                    calculatedRAP: itemRAP,
                    serialNumber
                  }
                })
                .sort((a, b) => {
                  // Sort by value first (highest first), then by RAP, then by price
                  if (b.calculatedValue !== a.calculatedValue) {
                    return b.calculatedValue - a.calculatedValue
                  }
                  if (b.calculatedRAP !== a.calculatedRAP) {
                    return b.calculatedRAP - a.calculatedRAP
                  }
                  return (b.items?.current_price || b.purchase_price || 0) - (a.items?.current_price || a.purchase_price || 0)
                })
                .map((userItem) => {
                  return (
                    <Link 
                      key={userItem.id} 
                      to={`/catalog/${userItem.item_id}`}
                      className="inventory-item"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div className="inventory-item-serial">Serial #{userItem.serialNumber}</div>
                      <div className="inventory-item-image">
                        <img 
                          src={userItem.items?.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${userItem.items?.roblox_item_id}&width=420&height=420&format=png`}
                          alt={userItem.items?.name}
                        />
                        {userItem.items?.is_limited && (
                          <div className="limited-badge-inv">
                            <span className="limited-tag-inv">LIMITED</span>
                            {userItem.items?.sale_type === 'stock' && <span className="limited-u-tag-inv">U</span>}
                          </div>
                        )}
                      </div>
                      <div className="inventory-item-name">{userItem.items?.name}</div>
                      <div className="inventory-item-price">${userItem.calculatedValue.toLocaleString()}</div>
                    </Link>
                  )
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Profile

