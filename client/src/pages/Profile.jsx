import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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
  const [loading, setLoading] = useState(true)
  const [portfolioData, setPortfolioData] = useState([])
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
    } catch (error) {
      console.error('Error fetching inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPortfolioData = async () => {
    try {
      const response = await axios.get(`/api/users/${userId}/inventory`)
      const items = response.data
      
      // Get all unique item IDs
      const itemIds = [...new Set(items.map(item => item.item_id))]
      
      // Fetch RAP history for all items
      const rapPromises = itemIds.map(itemId => 
        axios.get(`/api/items/${itemId}/rap-history`).catch(() => ({ data: [] }))
      )
      const rapResponses = await Promise.all(rapPromises)
      
      // Create a map of item_id to RAP history
      const rapMap = new Map()
      itemIds.forEach((itemId, index) => {
        rapMap.set(itemId, rapResponses[index].data || [])
      })
      
      // Group RAP history by date and calculate portfolio value
      const dateMap = new Map()
      
      items.forEach(userItem => {
        const itemId = userItem.item_id
        const rapHistory = rapMap.get(itemId) || []
        const itemValue = userItem.items?.value || userItem.items?.current_price || userItem.purchase_price || 0
        
        rapHistory.forEach(rap => {
          const date = new Date(rap.timestamp).toLocaleDateString()
          if (!dateMap.has(date)) {
            dateMap.set(date, { value: 0, rap: 0 })
          }
          const dayData = dateMap.get(date)
          dayData.value += itemValue
          dayData.rap += rap.rap_value
        })
      })
      
      // Convert to array and sort by date
      const data = Array.from(dateMap.entries())
        .map(([date, values]) => ({ date, ...values }))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
      
      setPortfolioData(data)
    } catch (error) {
      console.error('Error fetching portfolio data:', error)
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
    
    let itemValue = itemData.value || itemData.current_price || item.purchase_price || 0
    
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
                <span className="stat-value">${(profileUser?.cash || user?.cash || 0)?.toLocaleString()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Portfolio Value:</span>
                <span className="stat-value">${totalValue.toLocaleString()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">RAP:</span>
                <span className="stat-value">${totalRAP.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RAP/Value Graph */}
        {portfolioData.length > 0 && (
          <div className="portfolio-graph card">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={portfolioData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#4a4a4a" />
                <XAxis dataKey="date" stroke="#b0b0b0" />
                <YAxis stroke="#b0b0b0" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#393939', border: '1px solid #4a4a4a', borderRadius: '4px' }}
                  labelStyle={{ color: '#ffffff' }}
                />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#00a2ff" name="Value" dot={false} />
                <Line type="monotone" dataKey="rap" stroke="#00ff88" name="RAP" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

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
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .map((userItem, index) => {
                  // Calculate serial number based on creation order for this item
                  const sameItemInventory = inventory
                    .filter(item => item.item_id === userItem.item_id)
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                  const serialNumber = sameItemInventory.findIndex(item => item.id === userItem.id) + 1
                  
                  // Calculate item value - check if out of stock and use reseller price
                  const itemData = userItem.items
                  let itemValue = itemData?.value || itemData?.current_price || userItem.purchase_price || 0
                  
                  if (itemData) {
                    const isOutOfStock = itemData.is_off_sale || 
                      (itemData.sale_type === 'stock' && itemData.remaining_stock <= 0)
                    
                    // If out of stock or limited, use reseller price if available
                    if ((itemData.is_limited || isOutOfStock) && resellerPrices[userItem.item_id]) {
                      itemValue = resellerPrices[userItem.item_id]
                    }
                  }
                  
                  return (
                    <div key={userItem.id} className="inventory-item">
                      <div className="inventory-item-serial">Serial #{serialNumber}</div>
                      <div className="inventory-item-image">
                        <img 
                          src={`https://www.roblox.com/asset-thumbnail/image?assetId=${userItem.items?.roblox_item_id}&width=420&height=420&format=png`}
                          alt={userItem.items?.name}
                        />
                        {userItem.items?.is_limited && <span className="limited-badge-inv">LIMITED U</span>}
                      </div>
                      <div className="inventory-item-name">{userItem.items?.name}</div>
                      <div className="inventory-item-price">${itemValue.toLocaleString()}</div>
                      {!id && userItem.is_for_sale && (
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={async () => {
                            try {
                              await axios.post('/api/marketplace/list', {
                                user_item_id: userItem.id,
                                sale_price: null
                              })
                              fetchInventory()
                              showPopup('Item unlisted', 'success')
                            } catch (error) {
                              showPopup('Failed to unlist item', 'error')
                            }
                          }}
                        >
                          Unlist
                        </button>
                      )}
                    </div>
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

