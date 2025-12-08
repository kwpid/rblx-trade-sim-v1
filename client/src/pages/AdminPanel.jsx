import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useNotifications } from '../contexts/NotificationContext'
import './AdminPanel.css'

const AdminItemEditForm = ({ item, onUpdate }) => {
  const [value, setValue] = useState(item.value || item.current_price || 0)
  const isOutOfStock = item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0)
  
  return (
    <div className="admin-edit-form">
      <h3>Edit Item</h3>
      <div className="form-group">
        <label>Value {isOutOfStock ? '' : '(Only editable when out of stock)'}</label>
        <input
          type="number"
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!isOutOfStock}
          min="0"
          step="1"
        />
        {isOutOfStock && (
          <button 
            className="btn btn-small" 
            onClick={() => onUpdate({ value: parseFloat(value) })}
          >
            Update Value
          </button>
        )}
      </div>
    </div>
  )
}

const AdminPanel = () => {
  const [items, setItems] = useState([])
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [rapHistory, setRapHistory] = useState([])
  const [resellers, setResellers] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [formData, setFormData] = useState({
    roblox_item_id: '',
    initial_price: '',
    sale_type: 'stock',
    stock_count: '',
    timer_duration: '',
    is_off_sale: false
  })
  const [itemPreview, setItemPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const { showPopup } = useNotifications()

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/admin/items')
      setItems(response.data)
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchItemPreview = async (itemId) => {
    if (!itemId || itemId.length < 1) {
      setItemPreview(null)
      return
    }

    setLoadingPreview(true)
    try {
      // Try to fetch from Roblox API
      const response = await axios.get(`https://economy.roblox.com/v2/assets/${itemId}/details`)
      if (response.data) {
        setItemPreview({
          name: response.data.Name || 'Unknown Item',
          description: response.data.Description || 'No description available',
          imageUrl: `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=420&height=420&format=png`
        })
      }
    } catch (error) {
      // Fallback to basic preview
      setItemPreview({
        name: `Item ${itemId}`,
        description: 'Item description will be fetched when created',
        imageUrl: `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=420&height=420&format=png`
      })
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleItemIdChange = (e) => {
    const value = e.target.value
    setFormData({ ...formData, roblox_item_id: value })
    if (value) {
      fetchItemPreview(value)
    } else {
      setItemPreview(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/api/admin/items', formData)
      showPopup('Item created successfully!', 'success')
      setShowUploadForm(false)
      setItemPreview(null)
      setFormData({
        roblox_item_id: '',
        initial_price: '',
        sale_type: 'stock',
        stock_count: '',
        timer_duration: '',
        is_off_sale: false
      })
      fetchItems()
    } catch (error) {
      showPopup(error.response?.data?.error || 'Failed to create item', 'error')
    }
  }

  const handleViewDetails = async (item) => {
    setSelectedItem(item)
    try {
      const [rapResponse, resellersResponse] = await Promise.all([
        axios.get(`/api/items/${item.id}/rap-history`),
        axios.get(`/api/items/${item.id}/resellers`)
      ])
      setRapHistory(rapResponse.data)
      setResellers(resellersResponse.data)
    } catch (error) {
      console.error('Error fetching details:', error)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="admin-panel">
      <div className="container">
        <div className="admin-header">
          <h1>Admin Panel</h1>
          <button className="btn" onClick={() => setShowUploadForm(true)}>
            Upload New Item
          </button>
        </div>

        {showUploadForm && (
          <div className="modal-overlay" onClick={() => setShowUploadForm(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Upload New Item</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Roblox Item ID</label>
                  <input
                    type="text"
                    value={formData.roblox_item_id}
                    onChange={handleItemIdChange}
                    className="input"
                    required
                    placeholder="Enter Roblox Item ID"
                  />
                  {loadingPreview && <div className="preview-loading">Loading preview...</div>}
                </div>
                {itemPreview && (
                  <div className="item-preview">
                    <h3>Preview</h3>
                    <div className="preview-content">
                      <img src={itemPreview.imageUrl} alt={itemPreview.name} className="preview-image" />
                      <div className="preview-info">
                        <div className="preview-name">{itemPreview.name}</div>
                        <div className="preview-description">{itemPreview.description}</div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label>Initial Price (R$)</label>
                  <input
                    type="number"
                    value={formData.initial_price}
                    onChange={(e) => setFormData({ ...formData, initial_price: e.target.value })}
                    className="input"
                    min="1"
                    step="1"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Sale Type</label>
                  <select
                    value={formData.sale_type}
                    onChange={(e) => setFormData({ ...formData, sale_type: e.target.value })}
                    className="input"
                  >
                    <option value="stock">Stock</option>
                    <option value="timer">Timer</option>
                  </select>
                </div>
                {formData.sale_type === 'stock' && (
                  <div className="form-group">
                    <label>Stock Count</label>
                    <input
                      type="number"
                      value={formData.stock_count}
                      onChange={(e) => setFormData({ ...formData, stock_count: e.target.value })}
                      className="input"
                      min="1"
                      step="1"
                      required
                    />
                  </div>
                )}
                {formData.sale_type === 'timer' && (
                  <div className="form-group">
                    <label>Timer Duration (minutes)</label>
                    <input
                      type="number"
                      value={formData.timer_duration}
                      onChange={(e) => setFormData({ ...formData, timer_duration: e.target.value })}
                      className="input"
                      min="1"
                      step="1"
                      required
                    />
                  </div>
                )}
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.is_off_sale}
                      onChange={(e) => setFormData({ ...formData, is_off_sale: e.target.checked })}
                    />
                    Off-Sale (not visible in marketplace)
                  </label>
                </div>
                <div className="modal-actions">
                  <button type="submit" className="btn">
                    Create Item
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowUploadForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="admin-items">
          <h2>All Items</h2>
          <div className="items-table">
            <div className="table-header">
              <div>Image</div>
              <div>Name</div>
              <div>Price</div>
              <div>Type</div>
              <div>Status</div>
              <div>Actions</div>
            </div>
            {items.map(item => (
              <div key={item.id} className="table-row">
                <div><img src={`https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`} alt={item.name} className="item-thumb" /></div>
                <div>{item.name}</div>
                <div>R${item.current_price?.toLocaleString()}</div>
                <div>{item.sale_type}</div>
                <div>
                  {item.is_limited && <span className="badge limited">Limited</span>}
                  {item.is_off_sale && <span className="badge off-sale">Off-Sale</span>}
                  {!item.is_limited && !item.is_off_sale && <span className="badge active">Active</span>}
                </div>
                <div className="admin-actions">
                  <button className="btn btn-secondary" onClick={() => handleViewDetails(item)}>
                    View Details
                  </button>
                  <button 
                    className="btn btn-danger" 
                    onClick={async () => {
                      if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
                        try {
                          await axios.delete(`/api/admin/items/${item.id}`)
                          showPopup('Item deleted successfully', 'success')
                          fetchItems()
                        } catch (error) {
                          showPopup(error.response?.data?.error || 'Failed to delete item', 'error')
                        }
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedItem && (
          <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
            <div className="modal large-modal" onClick={(e) => e.stopPropagation()}>
              <h2>{selectedItem.name}</h2>
              <AdminItemEditForm 
                item={selectedItem} 
                onUpdate={async (updates) => {
                  try {
                    await axios.put(`/api/admin/items/${selectedItem.id}`, updates)
                    showPopup('Item updated successfully', 'success')
                    fetchItems()
                    setSelectedItem(null)
                  } catch (error) {
                    showPopup(error.response?.data?.error || 'Failed to update item', 'error')
                  }
                }}
              />
              <div className="item-details-grid">
                <div>
                  <img src={`https://www.roblox.com/asset-thumbnail/image?assetId=${selectedItem.roblox_item_id}&width=420&height=420&format=png`} alt={selectedItem.name} className="detail-image" />
                </div>
                <div>
                  <h3>RAP History</h3>
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
                      <Line type="monotone" dataKey="rap_value" stroke="#00a2ff" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h3>Resellers</h3>
                  {resellers.length === 0 ? (
                    <p>No resellers</p>
                  ) : (
                    <div className="resellers-list">
                      {resellers.map(reseller => (
                        <div key={reseller.id} className="reseller-item">
                          <span>{reseller.users?.username}</span>
                          <span>R${reseller.sale_price?.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button className="btn" onClick={() => setSelectedItem(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminPanel

