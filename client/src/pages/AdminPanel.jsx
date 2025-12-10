import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useNotifications } from '../contexts/NotificationContext'
import './AdminPanel.css'

const AdminItemEditForm = ({ item, onUpdate }) => {
  const [value, setValue] = useState(item.value ?? 0)
  const [imageUrl, setImageUrl] = useState(item.image_url || '')
  const [itemName, setItemName] = useState(item.name || '')
  const [itemDescription, setItemDescription] = useState(item.description || '')
  const isOutOfStock = item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0)

  return (
    <div className="admin-edit-form">
      <h3>Edit Item</h3>
      <div className="form-group">
        <label>Item Name</label>
        <input
          type="text"
          className="input"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Item name"
        />
        <button
          className="btn btn-small"
          onClick={() => onUpdate({ name: itemName.trim() })}
          style={{ marginTop: '8px' }}
        >
          Update Name
        </button>
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea
          className="input"
          value={itemDescription}
          onChange={(e) => setItemDescription(e.target.value)}
          placeholder="Item description"
          rows="3"
        />
        <button
          className="btn btn-small"
          onClick={() => onUpdate({ description: itemDescription.trim() })}
          style={{ marginTop: '8px' }}
        >
          Update Description
        </button>
      </div>
      <div className="form-group">
        <label>Image URL</label>
        <input
          type="url"
          className="input"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://tr.rbxcdn.com/..."
        />
        <small style={{ color: 'var(--roblox-text-muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
          Leave empty to use Roblox thumbnail. Example: https://tr.rbxcdn.com/180DAY-e8169c1b6658967004dde52ffd71e56d/420/420/Hat/Webp/noFilter
        </small>
        <button
          className="btn btn-small"
          onClick={() => onUpdate({ image_url: imageUrl.trim() || null })}
          style={{ marginTop: '8px' }}
        >
          Update Image
        </button>
        {imageUrl && (
          <div style={{ marginTop: '12px' }}>
            <img
              src={imageUrl}
              alt="Preview"
              style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: '8px', border: '1px solid var(--roblox-border)' }}
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
          </div>
        )}
      </div>
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
            style={{ marginTop: '8px' }}
          >
            Update Value
          </button>
        )}
      </div>
    </div>
  )
}

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('items') // 'items' or 'values'
  const [items, setItems] = useState([])
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [rapHistory, setRapHistory] = useState([])
  const [resellers, setResellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [valueUpdateForm, setValueUpdateForm] = useState({
    item_id: '',
    value: '',
    explanation: '',
    trend: 'stable',
    demand: 'unknown'
  })
  const [itemSearchQuery, setItemSearchQuery] = useState('')

  const [formData, setFormData] = useState({
    roblox_item_id: '',
    initial_price: '',
    sale_type: 'stock',
    stock_count: '',
    timer_duration: '',
    timer_unit: 'hours',
    is_off_sale: false,
    image_url: '',
    buy_limit: '',
    initial_value: ''
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
        item_name: '',
        item_description: '',
        initial_price: '',
        sale_type: 'stock',
        stock_count: '',
        timer_duration: '',
        timer_unit: 'hours',
        is_off_sale: false,
        image_url: '',
        is_off_sale: false,
        image_url: '',
        buy_limit: '',
        initial_value: ''
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
        </div>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'items' ? 'active' : ''}`}
            onClick={() => setActiveTab('items')}
          >
            Items
          </button>
          <button
            className={`admin-tab ${activeTab === 'values' ? 'active' : ''}`}
            onClick={() => setActiveTab('values')}
          >
            Value Updates
          </button>
        </div>

        {activeTab === 'items' && (
          <>
            <div className="admin-header" style={{ marginTop: '24px', marginBottom: '24px' }}>
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
                    {(itemPreview || formData.image_url) && (
                      <div className="item-preview">
                        <h3>Preview</h3>
                        <div className="preview-content">
                          <img
                            src={formData.image_url || itemPreview?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${formData.roblox_item_id}&width=420&height=420&format=png`}
                            alt={formData.item_name || itemPreview?.name || 'Item Preview'}
                            className="preview-image"
                            onError={(e) => {
                              e.target.src = `https://www.roblox.com/asset-thumbnail/image?assetId=${formData.roblox_item_id}&width=420&height=420&format=png`
                            }}
                          />
                          <div className="preview-info">
                            <div className="preview-name">{formData.item_name || itemPreview?.name || 'Item Preview'}</div>
                            <div className="preview-description">{formData.item_description || itemPreview?.description || 'Enter Roblox Item ID to see details'}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="form-group">
                      <label>Item Name (Optional - leave empty to use Roblox name)</label>
                      <input
                        type="text"
                        value={formData.item_name}
                        onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                        className="input"
                        placeholder="Custom item name"
                      />
                      <small style={{ color: 'var(--roblox-text-muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        If left empty, the name from Roblox will be used
                      </small>
                    </div>
                    <div className="form-group">
                      <label>Description (Optional - leave empty to use Roblox description)</label>
                      <textarea
                        value={formData.item_description}
                        onChange={(e) => setFormData({ ...formData, item_description: e.target.value })}
                        className="input"
                        placeholder="Custom item description"
                        rows="3"
                      />
                      <small style={{ color: 'var(--roblox-text-muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        If left empty, the description from Roblox will be used
                      </small>
                    </div>
                    <div className="form-group">
                      <label>Image URL (Optional - leave empty to use Roblox thumbnail)</label>
                      <input
                        type="url"
                        value={formData.image_url}
                        onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                        className="input"
                        placeholder="https://tr.rbxcdn.com/..."
                      />
                      <small style={{ color: 'var(--roblox-text-muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        Example: https://tr.rbxcdn.com/180DAY-e8169c1b6658967004dde52ffd71e56d/420/420/Hat/Webp/noFilter
                      </small>
                    </div>
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
                      <label>Initial Value (Hidden until Limited)</label>
                      <input
                        type="number"
                        value={formData.initial_value}
                        onChange={(e) => setFormData({ ...formData, initial_value: e.target.value })}
                        className="input"
                        min="0"
                        step="1"
                        placeholder="Optional - Def. 0"
                      />
                      <small style={{ color: 'var(--roblox-text-muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        This value is used by AI immediately, but hidden from players until the item becomes Limited.
                      </small>
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
                        <label>Timer Duration</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="number"
                            value={formData.timer_duration}
                            onChange={(e) => setFormData({ ...formData, timer_duration: e.target.value })}
                            className="input"
                            min="1"
                            step="1"
                            required
                            style={{ flex: 1 }}
                          />
                          <select
                            value={formData.timer_unit}
                            onChange={(e) => setFormData({ ...formData, timer_unit: e.target.value })}
                            className="input"
                            style={{ width: '120px' }}
                          >
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                            <option value="weeks">Weeks</option>
                          </select>
                        </div>
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
                    <div className="form-group">
                      <label>Buy Limit (Optional - how many copies a user can buy at original price)</label>
                      <input
                        type="number"
                        value={formData.buy_limit}
                        onChange={(e) => setFormData({ ...formData, buy_limit: e.target.value })}
                        className="input"
                        min="1"
                        step="1"
                        placeholder="Leave empty for unlimited"
                      />
                      <small style={{ color: 'var(--roblox-text-muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        Limits how many copies a user can purchase at the original price. Does not apply to reseller purchases.
                      </small>
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
                {items.map(item => {
                  const imageUrl = item.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`
                  return (
                    <div key={item.id} className="table-row">
                      <div><img src={imageUrl} alt={item.name} className="item-thumb" /></div>
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
                  )
                })}
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
                      <img src={selectedItem.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${selectedItem.roblox_item_id}&width=420&height=420&format=png`} alt={selectedItem.name} className="detail-image" />
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
          </>
        )}

        {activeTab === 'values' && (
          <div className="value-update-section">
            <h2>Update Item Values</h2>
            <p style={{ color: 'var(--roblox-text-muted)', marginBottom: '24px' }}>
              Update values for items that are out of stock or limited. Each update requires an explanation.
            </p>

            <div className="value-update-form">
              <div className="form-group">
                <label>Select Item</label>
                <div className="item-selector-container">
                  <input
                    type="text"
                    className="input"
                    placeholder="Search items..."
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    style={{ marginBottom: '12px' }}
                  />
                  <div className="item-selector-grid">
                    {items
                      .filter(item => {
                        const matchesSearch = itemSearchQuery === '' || item.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
                        return matchesSearch
                      })
                      .map(item => {
                        const isEligible = item.is_limited || item.is_off_sale ||
                          (item.sale_type === 'stock' && item.remaining_stock <= 0) ||
                          (item.sale_type === 'timer' && new Date(item.sale_end_time) < new Date())
                        const imageUrl = item.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`
                        const isSelected = valueUpdateForm.item_id === item.id
                        return (
                          <div
                            key={item.id}
                            className={`item-selector-card ${isSelected ? 'selected' : ''} ${!isEligible ? 'disabled' : ''}`}
                            onClick={() => {
                              if (isEligible) {
                                setValueUpdateForm({
                                  ...valueUpdateForm,
                                  item_id: item.id,
                                  value: item.value || 0,
                                  trend: item.trend || 'stable',
                                  demand: item.demand || 'unknown'
                                })
                              }
                            }}
                          >
                            <img src={imageUrl} alt={item.name} className="item-selector-image" />
                            <div className="item-selector-name">{item.name}</div>
                            <div className="item-selector-status">
                              {item.is_limited ? 'Limited' :
                                item.is_off_sale ? 'Off Sale' :
                                  (item.sale_type === 'stock' && item.remaining_stock <= 0) ? 'Out of Stock' :
                                    (item.sale_type === 'timer' && new Date(item.sale_end_time) < new Date()) ? 'Limited' :
                                      'In Stock'}
                            </div>
                            <div className="item-selector-value">
                              Value: R${(item.value || 0).toLocaleString()}
                            </div>
                            {!isEligible && (
                              <div className="item-selector-note" style={{ fontSize: '11px', color: 'var(--roblox-text-muted)', marginTop: '4px' }}>
                                Must be out of stock to update
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>
                  {items.filter(item => {
                    const matchesSearch = itemSearchQuery === '' || item.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
                    return matchesSearch
                  }).length === 0 && (
                      <p style={{ textAlign: 'center', color: 'var(--roblox-text-muted)', padding: '24px' }}>
                        No items found
                      </p>
                    )}
                </div>
              </div>

              {valueUpdateForm.item_id && (
                <>
                  <div className="form-group">
                    <label>Value (R$)</label>
                    <input
                      type="number"
                      className="input"
                      value={valueUpdateForm.value}
                      onChange={(e) => setValueUpdateForm({ ...valueUpdateForm, value: e.target.value })}
                      min="0"
                      step="1"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Trend</label>
                    <select
                      className="input"
                      value={valueUpdateForm.trend}
                      onChange={(e) => setValueUpdateForm({ ...valueUpdateForm, trend: e.target.value })}
                      required
                    >
                      <option value="declining">Declining</option>
                      <option value="stable">Stable</option>
                      <option value="rising">Rising</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Demand</label>
                    <select
                      className="input"
                      value={valueUpdateForm.demand}
                      onChange={(e) => setValueUpdateForm({ ...valueUpdateForm, demand: e.target.value })}
                      required
                    >
                      <option value="very_low">Very Low</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="very_high">Very High</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Explanation *</label>
                    <textarea
                      className="input"
                      value={valueUpdateForm.explanation}
                      onChange={(e) => setValueUpdateForm({ ...valueUpdateForm, explanation: e.target.value })}
                      placeholder="Explain why you're updating this value..."
                      rows="4"
                      required
                    />
                    <small style={{ color: 'var(--roblox-text-muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      Required: Please provide a reason for this value update
                    </small>
                  </div>

                  <button
                    className="btn"
                    onClick={async () => {
                      if (!valueUpdateForm.explanation || valueUpdateForm.explanation.trim() === '') {
                        showPopup('Explanation is required', 'error')
                        return
                      }

                      try {
                        await axios.put(`/api/admin/items/${valueUpdateForm.item_id}`, {
                          value: parseFloat(valueUpdateForm.value),
                          trend: valueUpdateForm.trend,
                          demand: valueUpdateForm.demand,
                          value_update_explanation: valueUpdateForm.explanation,
                          value_updated_at: new Date().toISOString()
                        })
                        showPopup('Value updated successfully', 'success')
                        setValueUpdateForm({
                          item_id: '',
                          value: '',
                          explanation: '',
                          trend: 'stable',
                          demand: 'unknown'
                        })
                        fetchItems()
                      } catch (error) {
                        showPopup(error.response?.data?.error || 'Failed to update value', 'error')
                      }
                    }}
                  >
                    Update Value
                  </button>
                </>
              )}
            </div>

            <div className="value-update-history" style={{ marginTop: '32px' }}>
              <h3>Recent Value Updates</h3>
              <div className="items-table">
                <div className="table-header">
                  <div>Item</div>
                  <div>Value</div>
                  <div>Trend</div>
                  <div>Demand</div>
                  <div>Updated</div>
                </div>
                {items
                  .filter(item => item.is_limited || item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0))
                  .sort((a, b) => new Date(b.value_updated_at || 0) - new Date(a.value_updated_at || 0))
                  .slice(0, 20)
                  .map(item => (
                    <div key={item.id} className="table-row">
                      <div>{item.name}</div>
                      <div>R${(item.value || 0).toLocaleString()}</div>
                      <div style={{ textTransform: 'capitalize' }}>{item.trend || 'stable'}</div>
                      <div style={{ textTransform: 'capitalize' }}>{(item.demand || 'unknown').replace('_', ' ')}</div>
                      <div>{item.value_updated_at ? new Date(item.value_updated_at).toLocaleDateString() : 'Never'}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminPanel

