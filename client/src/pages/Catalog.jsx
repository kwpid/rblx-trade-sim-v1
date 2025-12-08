import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { useNotifications } from '../contexts/NotificationContext'
import './Catalog.css'

const Catalog = () => {
  const [items, setItems] = useState([])
  const [resellerPrices, setResellerPrices] = useState({})
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
      const itemsData = response.data
      setItems(itemsData)
      
      // Fetch reseller prices for limited items and out-of-stock items
      const itemsNeedingResellers = itemsData.filter(item => 
        item.is_limited || item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0)
      )
      
      const pricePromises = itemsNeedingResellers.map(async (item) => {
        try {
          const res = await axios.get(`/api/items/${item.id}/resellers`)
          if (res.data && res.data.length > 0) {
            return { itemId: item.id, price: res.data[0].sale_price }
          }
          return { itemId: item.id, price: null }
        } catch (e) {
          return { itemId: item.id, price: null }
        }
      })
      
      const prices = await Promise.all(pricePromises)
      const priceMap = {}
      prices.forEach(({ itemId, price }) => {
        priceMap[itemId] = price
      })
      setResellerPrices(priceMap)
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
      const resellerPrice = resellerPrices[item.id]
      if (resellerPrice && resellerPrice > 0) {
        return `$${resellerPrice.toLocaleString()}`
      }
      return null
    }
    if (item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0)) {
      const resellerPrice = resellerPrices[item.id]
      if (resellerPrice && resellerPrice > 0) {
        return `$${resellerPrice.toLocaleString()}`
      }
      return null
    }
    return `$${(item.current_price || 0).toLocaleString()}`
  }
  
  const hasNoResellers = (item) => {
    if (item.is_limited || item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0)) {
      const resellerPrice = resellerPrices[item.id]
      return !resellerPrice || resellerPrice <= 0
    }
    return false
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
              const noResellers = hasNoResellers(item)
              
              const imageUrl = `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`
              const isInStock = !item.is_limited && !item.is_off_sale && item.sale_type === 'stock' && item.remaining_stock > 0
              
              return (
                <Link key={item.id} to={`/catalog/${item.id}`} className="catalog-item-card">
                  <div className="item-image-wrapper">
                    <img 
                      src={imageUrl}
                      alt={item.name}
                    />
                    {item.is_limited && (
                      <div className="limited-badge-overlay">
                        <span className="limited-tag">LIMITED</span>
                        <span className="limited-u-tag">U</span>
                      </div>
                    )}
                    {isInStock && (
                      <div className="new-badge">NEW</div>
                    )}
                  </div>
                  <div className="item-details">
                    <h3>{item.name}</h3>
                    {noResellers ? (
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
