import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { useNotifications } from '../contexts/NotificationContext'
import './Catalog.css'

const Catalog = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('relevance')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 32

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      const response = await axios.get('/api/items')
      setItems(response.data)
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
      case 'price_low':
        return (a.best_price || a.current_price || 0) - (b.best_price || b.current_price || 0)
      case 'price_high':
        return (b.best_price || b.current_price || 0) - (a.best_price || a.current_price || 0)
      case 'name':
        return a.name.localeCompare(b.name)
      default:
        return 0
    }
  })

  const totalPages = Math.ceil(sortedItems.length / itemsPerPage)
  const paginatedItems = sortedItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const getItemPrice = (item) => {
    if (item.is_limited) {
      if (item.best_price && item.best_price > 0) {
        return `$${item.best_price.toLocaleString()}`
      }
      return null
    }
    if (item.is_off_sale) {
      return null
    }
    return `$${(item.current_price || 0).toLocaleString()}`
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="catalog">
      <div className="catalog-header">
        <div className="search-container">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>
        <select
          className="sort-dropdown"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="relevance">Relevance</option>
          <option value="price_low">Price: Low to High</option>
          <option value="price_high">Price: High to Low</option>
          <option value="name">Name</option>
        </select>
      </div>

      {paginatedItems.length === 0 ? (
        <div className="catalog-empty">
          <h2>No items found</h2>
          <p>Try adjusting your search terms</p>
        </div>
      ) : (
        <>
          <div className="catalog-grid">
            {paginatedItems.map(item => {
              const price = getItemPrice(item)
              const hasNoResellers = item.is_limited && !price
              
              return (
                <Link key={item.id} to={`/catalog/${item.id}`} className="catalog-item-card">
                  <div className="item-image-wrapper">
                    <img 
                      src={item.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`} 
                      alt={item.name}
                      onError={(e) => {
                        e.target.src = `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`
                      }}
                    />
                    {item.is_limited && (
                      <div className="limited-badge-overlay">
                        <span className="limited-tag">LIMITED</span>
                        <span className="limited-u-tag">U</span>
                      </div>
                    )}
                  </div>
                  <div className="item-details">
                    <h3>{item.name}</h3>
                    {hasNoResellers ? (
                      <div className="item-price no-resellers">No Resellers</div>
                    ) : price ? (
                      <div className="item-price">{price}</div>
                    ) : null}
                  </div>
                </Link>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                ‹
              </button>
              <span className="pagination-text">Page {currentPage}</span>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Catalog
