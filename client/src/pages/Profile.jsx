import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useNotifications } from '../contexts/NotificationContext'
import './Profile.css'

const Profile = () => {
  const { user } = useAuth()
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState(null)
  const [salePrice, setSalePrice] = useState('')
  const [portfolioData, setPortfolioData] = useState([])
  const { showPopup } = useNotifications()

  useEffect(() => {
    if (user) {
      fetchInventory()
      fetchPortfolioData()
    }
  }, [user])

  const fetchInventory = async () => {
    try {
      const response = await axios.get(`/api/users/${user.id}/inventory`)
      setInventory(response.data)
    } catch (error) {
      console.error('Error fetching inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPortfolioData = async () => {
    try {
      const response = await axios.get(`/api/users/${user.id}/inventory`)
      const items = response.data
      
      // Calculate portfolio value over time (simplified - using purchase prices)
      const totalValue = items.reduce((sum, item) => sum + (item.purchase_price || 0), 0)
      const totalRAP = items.reduce((sum, item) => {
        const itemRAP = item.items?.current_price || item.purchase_price || 0
        return sum + itemRAP
      }, 0)
      
      // Create mock historical data (in real app, this would come from database)
      const data = []
      const now = new Date()
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        data.push({
          date: date.toLocaleDateString(),
          value: totalValue + (Math.random() * 100000 - 50000),
          rap: totalRAP + (Math.random() * 100000 - 50000)
        })
      }
      setPortfolioData(data)
    } catch (error) {
      console.error('Error fetching portfolio data:', error)
    }
  }

  const handleListForSale = async (userItemId) => {
    if (!salePrice || salePrice <= 0) {
      showPopup('Please enter a valid sale price', 'error')
      return
    }

    try {
      await axios.post('/api/marketplace/list', {
        user_item_id: userItemId,
        sale_price: parseFloat(salePrice)
      })
      showPopup('Item listed for sale!', 'success')
      setSelectedItem(null)
      setSalePrice('')
      fetchInventory()
    } catch (error) {
      showPopup(error.response?.data?.error || 'Failed to list item', 'error')
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  const totalValue = inventory.reduce((sum, item) => sum + (item.purchase_price || 0), 0)
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
            <h1>{user?.username}</h1>
            <div className="profile-stats">
              <div className="stat-item">
                <span className="stat-label">Cash:</span>
                <span className="stat-value">${user?.cash?.toLocaleString()}</span>
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
              {inventory.map((userItem, index) => (
                <div key={userItem.id} className="inventory-item">
                  <div className="inventory-item-serial">#{index + 1}</div>
                  <div className="inventory-item-image">
                    <img 
                      src={userItem.items?.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${userItem.items?.roblox_item_id}&width=420&height=420&format=png`} 
                      alt={userItem.items?.name}
                      onError={(e) => {
                        e.target.src = `https://www.roblox.com/asset-thumbnail/image?assetId=${userItem.items?.roblox_item_id}&width=420&height=420&format=png`
                      }}
                    />
                    {userItem.items?.is_limited && <span className="limited-badge-inv">LIMITED U</span>}
                  </div>
                  <div className="inventory-item-name">{userItem.items?.name}</div>
                  <div className="inventory-item-price">${userItem.purchase_price?.toLocaleString()}</div>
                  {userItem.is_for_sale ? (
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
                  ) : (
                    <button
                      className="btn btn-small"
                      onClick={() => setSelectedItem(userItem.id)}
                    >
                      List for Sale
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>List Item for Sale</h2>
            <div className="form-group">
              <label>Sale Price (R$)</label>
              <input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="input"
                min="1"
                step="1"
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn"
                onClick={() => handleListForSale(selectedItem)}
              >
                List Item
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSelectedItem(null)
                  setSalePrice('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Profile

