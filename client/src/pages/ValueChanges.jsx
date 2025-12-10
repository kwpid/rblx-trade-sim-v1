import { useState, useEffect } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import './ValueChanges.css'

const ValueChanges = () => {
  const [activeTab, setActiveTab] = useState('value') // 'value' or 'rap'
  const [valueChangeHistory, setValueChangeHistory] = useState([])
  const [rapChangeHistory, setRapChangeHistory] = useState([])
  const [filteredHistory, setFilteredHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTrend, setFilterTrend] = useState('all')
  const [filterDemand, setFilterDemand] = useState('all')

  useEffect(() => {
    fetchData()
  }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'value') {
        const response = await axios.get('/api/items/value-changes')
        setValueChangeHistory(response.data)
        setFilteredHistory(response.data)
      } else {
        const response = await axios.get('/api/items/rap-changes')
        setRapChangeHistory(response.data)
      }
    } catch (error) {
      console.error('Error fetching history:', error)
    } finally {
      setLoading(false)
    }
  }

  // Effect for filtering Value Change History
  useEffect(() => {
    if (activeTab === 'rap') return

    let filtered = valueChangeHistory

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(change => {
        const itemName = change.items?.name?.toLowerCase() || ''
        const explanation = change.explanation?.toLowerCase() || ''
        return itemName.includes(query) || explanation.includes(query)
      })
    }

    // Trend filter
    if (filterTrend !== 'all') {
      filtered = filtered.filter(change => change.new_trend === filterTrend)
    }

    // Demand filter
    if (filterDemand !== 'all') {
      filtered = filtered.filter(change => change.new_demand === filterDemand)
    }

    setFilteredHistory(filtered)
  }, [searchQuery, filterTrend, filterDemand, valueChangeHistory, activeTab])

  const formatValue = (value) => {
    return new Intl.NumberFormat('en-US').format(value || 0)
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown'
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const getValueChangeColor = (oldValue, newValue) => {
    if (newValue > oldValue) return 'var(--roblox-green)'
    if (newValue < oldValue) return 'var(--roblox-error)'
    return 'var(--roblox-text-secondary)'
  }

  const getTrendColor = (trend) => {
    switch (trend) {
      case 'rising':
        return 'var(--roblox-green)'
      case 'declining':
        return 'var(--roblox-error)'
      default:
        return 'var(--roblox-text-secondary)'
    }
  }

  return (
    <div className="value-changes-page">
      <div className="container">
        <div className="value-changes-header">
          <h1>Market Changes</h1>
          <p className="value-changes-description">
            Track recent updates to item values and RAP.
          </p>
        </div>

        <div className="value-changes-tabs">
          <button
            className={`vc-tab ${activeTab === 'value' ? 'active' : ''}`}
            onClick={() => setActiveTab('value')}
          >
            Value Changes
          </button>
          <button
            className={`vc-tab ${activeTab === 'rap' ? 'active' : ''}`}
            onClick={() => setActiveTab('rap')}
          >
            RAP Changes
          </button>
        </div>

        {activeTab === 'value' && (
          <>
            <div className="value-changes-filters">
              <input
                type="text"
                className="value-changes-search"
                placeholder="Search items or explanations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="value-changes-filter-group">
                <label>Trend:</label>
                <select
                  className="value-changes-filter-select"
                  value={filterTrend}
                  onChange={(e) => setFilterTrend(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="rising">Rising</option>
                  <option value="stable">Stable</option>
                  <option value="declining">Declining</option>
                </select>
              </div>
              <div className="value-changes-filter-group">
                <label>Demand:</label>
                <select
                  className="value-changes-filter-select"
                  value={filterDemand}
                  onChange={(e) => setFilterDemand(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="very_high">Very High</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="very_low">Very Low</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="loading"><div className="spinner"></div></div>
            ) : valueChangeHistory.length === 0 ? (
              <div className="empty-state">
                <p>No value changes recorded yet.</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="empty-state">
                <p>No value changes match your filters.</p>
              </div>
            ) : (
              <div className="value-changes-list">
                {filteredHistory.map((change) => (
                  <ValueChangeItem
                    key={change.id}
                    change={change}
                    formatValue={formatValue}
                    formatDate={formatDate}
                    getValueChangeColor={getValueChangeColor}
                    getTrendColor={getTrendColor}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'rap' && (
          <div className="rap-changes-section">
            {loading ? (
              <div className="loading"><div className="spinner"></div></div>
            ) : rapChangeHistory.length === 0 ? (
              <div className="empty-state">
                <p>No RAP changes recorded yet.</p>
              </div>
            ) : (
              <div className="rap-changes-list">
                {rapChangeHistory.map(log => {
                  const isStock = !log.seller;
                  return (
                    <div key={log.id} className="rap-change-card">
                      <Link to={`/catalog/${log.items?.id}`} className="rap-card-left">
                        <div className="rap-card-img">
                          <img src={log.items?.image_url} alt={log.items?.name} />
                        </div>
                        <div className="rap-card-info">
                          <h3>{log.items?.name || 'Unknown Item'}</h3>
                          <div className="rap-card-date">{formatDate(log.created_at)}</div>
                        </div>
                      </Link>
                      <div className="rap-card-stats">
                        <div className="rap-stat-col">
                          <span className="rap-stat-label">Price</span>
                          <span className="rap-stat-val">R${formatValue(log.amount)}</span>
                        </div>
                        <div className="rap-stat-col">
                          <span className="rap-stat-label">Seller</span>
                          {isStock ? (
                            <span className="rap-stat-val" style={{ color: '#aaa', fontStyle: 'italic' }}>System (Stock)</span>
                          ) : (
                            <Link to={`/players/${log.seller?.id}`} className="rap-stat-val user-link">
                              {log.seller?.username || 'Unknown'}
                            </Link>
                          )}
                        </div>
                        <div className="rap-arrow">→</div>
                        <div className="rap-stat-col">
                          <span className="rap-stat-label">Buyer</span>
                          <Link to={`/players/${log.buyer?.id}`} className="rap-stat-val user-link">
                            {log.buyer?.username || 'Unknown'}
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const ValueChangeItem = ({ change, formatValue, formatDate, getValueChangeColor, getTrendColor }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const item = change.items
  const imageUrl = item?.image_url ||
    (item?.roblox_item_id ? `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png` : '')
  const valueChange = (change.new_value || 0) - (change.previous_value || 0)
  const valueChangePercent = (change.previous_value || 0) > 0
    ? ((valueChange / (change.previous_value || 1)) * 100).toFixed(1)
    : 0

  return (
    <div className="value-change-card">
      <div className="value-change-compact">
        <Link to={`/catalog/${item?.id}`} className="value-change-item-compact">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={item?.name || 'Item'}
              className="value-change-image-compact"
            />
          )}
          <div className="value-change-info-compact">
            <h3>{item?.name || 'Unknown Item'}</h3>
            <div className="value-change-summary">
              <span className="value-old-compact">R${formatValue(change.previous_value)}</span>
              <span className="value-arrow-compact">→</span>
              <span
                className="value-new-compact"
                style={{ color: getValueChangeColor(change.previous_value, change.new_value) }}
              >
                R${formatValue(change.new_value)}
              </span>
              {valueChange !== 0 && (
                <span
                  className="value-change-delta-compact"
                  style={{ color: getValueChangeColor(change.previous_value, change.new_value) }}
                >
                  ({valueChange > 0 ? '+' : ''}{valueChangePercent}%)
                </span>
              )}
            </div>
            <div className="value-change-meta">
              <span className="trend-badge" style={{ color: getTrendColor(change.new_trend) }}>
                {change.new_trend ? change.new_trend.charAt(0).toUpperCase() + change.new_trend.slice(1) : 'Stable'}
              </span>
              <span className="demand-badge">
                {(change.new_demand || 'unknown').replace('_', ' ')}
              </span>
              <span className="value-change-date-compact">
                {formatDate(change.created_at)}
              </span>
            </div>
          </div>
        </Link>
        {change.explanation && (
          <button
            className="expand-button"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? '▼' : '▶'} Explanation
          </button>
        )}
      </div>
      {isExpanded && change.explanation && (
        <div className="value-change-expanded">
          <div className="value-change-explanation-compact">
            <strong>Explanation:</strong> {change.explanation}
          </div>
          {change.users && (
            <div className="value-change-footer-compact">
              <span className="changed-by">
                Updated by: <strong>{change.users.username}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ValueChanges
