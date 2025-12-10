import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './Profile.css'

const Profile = () => {
  const { id } = useParams()
  const { user } = useAuth()
  const [profileUser, setProfileUser] = useState(null)
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [portfolioData, setPortfolioData] = useState([])
  const [portfolioLoading, setPortfolioLoading] = useState(true)

  const targetUserId = id || user?.id

  useEffect(() => {
    if (targetUserId) {
      fetchProfile()
      fetchPortfolioData()
    }
  }, [targetUserId])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const userRes = await axios.get(`/api/users/${targetUserId}`)
      setProfileUser(userRes.data)

      const invRes = await axios.get(`/api/users/${targetUserId}/inventory`)
      setInventory(invRes.data)
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPortfolioData = async () => {
    try {
      setPortfolioLoading(true)
      const response = await axios.get(`/api/users/${targetUserId}/snapshots`)
      // Transform snapshots data to match chart format
      const formattedData = response.data.map(snapshot => ({
        date: new Date(snapshot.snapshot_date).toLocaleDateString(),
        value: snapshot.total_value || 0,
        rap: snapshot.total_rap || 0
      }))
      setPortfolioData(formattedData)
    } catch (error) {
      console.error('Error fetching portfolio:', error)
    } finally {
      setPortfolioLoading(false)
    }
  }

  const filteredInventory = inventory.filter(item =>
    item.items?.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalValue = inventory.reduce((sum, item) => {
    const itemData = item.items
    let itemValue = (itemData?.value !== null && itemData?.value !== undefined) ? itemData.value : 0

    if (itemData?.is_limited || itemData?.is_off_sale || (itemData?.sale_type === 'stock' && itemData?.remaining_stock <= 0)) {
      // For limited/off-sale items, use reseller price if available
      // This would need to be fetched separately in a real implementation
    }

    return sum + itemValue
  }, 0)

  const totalRAP = inventory.reduce((sum, item) => {
    const rap = item.items?.rap || item.items?.current_price || 0
    return sum + rap
  }, 0)

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="profile">
      <div className="container">
        {/* User Info Card */}
        <div className="profile-header-card">
          <div className="profile-left">
            <div className="profile-info">
              <div className="profile-name-container">
                <h1>{profileUser?.username || user?.username}</h1>
                {profileUser?.is_online && <div className="online-indicator"></div>}
              </div>
              <div className="profile-stats-new">
                <div className="stat-row">
                  <span className="stat-val">
                    ${(profileUser?.cash || user?.cash || 0)?.toLocaleString()}
                  </span>
                  <span className="stat-lbl">Cash</span>
                </div>
                <div className="stat-row">
                  <span className="stat-val">
                    {totalValue >= 1000000
                      ? `$${(totalValue / 1000000).toFixed(2)}M`
                      : `$${totalValue.toLocaleString()}`}
                  </span>
                  <span className="stat-lbl">Value</span>
                </div>
                <div className="stat-row">
                  <span className="stat-val">
                    {totalRAP >= 1000000
                      ? `$${(totalRAP / 1000000).toFixed(2)}M`
                      : `$${totalRAP.toLocaleString()}`}
                  </span>
                  <span className="stat-lbl">RAP</span>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-actions-right">
            {id && user && id !== user.id && (
              <Link to={`/trades/new?partner=${id}`} className="trade-btn-large">
                Trade
              </Link>
            )}
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
          ) : (
            <div style={{ textAlign: 'center', padding: '60px', color: '#8c8c8c' }}>
              No portfolio data available yet
            </div>
          )}
        </div>

        {/* Inventory Section */}
        <div className="inventory-section">
          <div className="inventory-header">
            <h2>Inventory</h2>
            <div className="inventory-controls">
              <input
                type="text"
                className="inventory-search"
                placeholder="Search inventory..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {filteredInventory.length === 0 ? (
            <div className="empty-inventory">
              {searchTerm ? 'No items match your search' : 'No items in inventory'}
            </div>
          ) : (
            <div className="inventory-grid">
              {filteredInventory
                .sort((a, b) => {
                  const aValue = (a.items?.value !== null && a.items?.value !== undefined) ? a.items.value : 0
                  const bValue = (b.items?.value !== null && b.items?.value !== undefined) ? b.items.value : 0
                  return bValue - aValue
                })
                .map((userItem) => {
                  const item = userItem.items
                  const serialNumber = userItem.serial_number || 1

                  let itemValue = (item?.value !== null && item?.value !== undefined) ? item.value : 0

                  return (
                    <Link
                      key={userItem.id}
                      to={`/catalog/${item.id}`}
                      className="inventory-item"
                    >
                      <div className="inventory-item-serial">Serial #{serialNumber}</div>
                      <div className="inventory-item-image">
                        <img src={item.image_url} alt={item.name} />
                        {item.is_limited && (
                          <div className="limited-badge-inv">
                            <span className="limited-tag-inv">LIMITED</span>
                            {item.sale_type === 'stock' && <span className="limited-u-tag-inv">U</span>}
                          </div>
                        )}
                      </div>
                      <div className="inventory-item-name">{item.name}</div>
                      <div className="inventory-item-price">${itemValue.toLocaleString()}</div>
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
