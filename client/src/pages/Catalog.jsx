import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link, useSearchParams } from 'react-router-dom'
import './Catalog.css'

const Catalog = () => {
  const [items, setItems] = useState([])
  const [resellerPrices, setResellerPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [totalItems, setTotalItems] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()

  // Calculate items per page based on screen size (3 rows)
  const getItemsPerPage = () => {
    const width = window.innerWidth
    if (width >= 1400) return 30 // 6 columns
    if (width >= 1200) return 24 // 5 columns
    if (width >= 992) return 18 // 4 columns
    if (width >= 768) return 15 // 3 columns
    if (width >= 576) return 12 // 2 columns
    return 9 // 1 column (mobile)
  }

  const [itemsPerPage, setItemsPerPage] = useState(getItemsPerPage())
  const currentPage = parseInt(searchParams.get('page') || '1')
  const [lastItemTimestamp, setLastItemTimestamp] = useState(null)

  // Simple auto-refresh - check for new items every 5 seconds
  useEffect(() => {
    const checkForNewItems = async () => {
      try {
        const response = await axios.get('/api/items', { params: { limit: 1, sort: 'newest' } })
        const { items: latestItems } = response.data
        
        if (latestItems && latestItems.length > 0) {
          const latestTimestamp = new Date(latestItems[0].created_at).getTime()
          
          if (lastItemTimestamp && latestTimestamp > lastItemTimestamp) {
            console.log('New item detected, refreshing catalog...')
            fetchItems()
          }
          
          setLastItemTimestamp(latestTimestamp)
        }
      } catch (error) {
        console.error('Error checking for new items:', error)
      }
    }

    // Check immediately, then every 5 seconds
    checkForNewItems()
    const interval = setInterval(checkForNewItems, 5000)
    return () => clearInterval(interval)
  }, [lastItemTimestamp])

  // Update items per page on resize
  useEffect(() => {
    const handleResize = () => {
      setItemsPerPage(getItemsPerPage())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [sortBy, currentPage, itemsPerPage])

  useEffect(() => {
    if (searchTerm) {
      fetchItems()
    }
  }, [searchTerm])

  const fetchItems = async () => {
    try {
      setLoading(true)

      let params = {
        limit: searchTerm ? 2000 : itemsPerPage,
        offset: searchTerm ? 0 : (currentPage - 1) * itemsPerPage,
        sort: sortBy
      }

      const response = await axios.get('/api/items', { params })
      let { items: itemsData, total } = response.data

      if (searchTerm) {
        // Filter client-side for search
        itemsData = itemsData.filter(item =>
          item.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        // Remove duplicates
        itemsData = itemsData.filter((item, index, self) =>
          index === self.findIndex(i => i.id === item.id)
        )
        setTotalItems(itemsData.length)
        // Paginate the filtered results
        const startIndex = (currentPage - 1) * itemsPerPage
        const endIndex = startIndex + itemsPerPage
        itemsData = itemsData.slice(startIndex, endIndex)
      } else {
        setTotalItems(total)
      }

      setItems(itemsData)

      // Fetch reseller prices for limited items and out-of-stock items
      const itemsNeedingResellers = itemsData.filter(item =>
        item.is_limited || item.is_off_sale || (item.sale_type === 'stock' && item.remaining_stock <= 0)
      )

      if (itemsNeedingResellers.length > 0) {
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
      }
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (page) => {
    setSearchParams({ page: page.toString() })
    window.scrollTo(0, 0) // Scroll to top on page change
  }

  const handleSearchChange = (value) => {
    setSearchTerm(value)
    if (value) {
      setSearchParams({ page: '1' }) // Reset to page 1 when searching
    }
  }

  const handleSortChange = (value) => {
    setSortBy(value)
    setSearchParams({ page: '1' }) // Reset to page 1 when sorting
  }

  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const filteredItems = items // Already filtered in fetchItems

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
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <select
          className="sort-dropdown"
          value={sortBy}
          onChange={(e) => handleSortChange(e.target.value)}
        >
          <option value="newest">Newest</option>
          <option value="price_low">Price: Low to High</option>
          <option value="price_high">Price: High to Low</option>
          <option value="value_low">Value: Low to High</option>
          <option value="value_high">Value: High to Low</option>
          <option value="limiteds">Limiteds Only</option>
          <option value="in_stock">In-Stock Only</option>
        </select>
      </div>

      {filteredItems.length === 0 ? (
        <div className="catalog-empty">
          <h2>No items found</h2>
          <p>Try adjusting your search terms</p>
        </div>
      ) : (
        <>
          <div className="catalog-grid">
            {filteredItems.map((item, index) => {
              const isLastItem = index === filteredItems.length - 1
              const price = getItemPrice(item)
              const noResellers = hasNoResellers(item)

              const imageUrl = item.image_url || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.roblox_item_id}&width=420&height=420&format=png`
              const isInStock = !item.is_limited && !item.is_off_sale && item.sale_type === 'stock' && item.remaining_stock > 0
              const isTimerActive = !item.is_limited && !item.is_off_sale && item.sale_type === 'timer' && new Date(item.sale_end_time) > new Date()
              const wasTimer = item.is_limited && item.sale_type === 'timer'
              const wasStock = item.is_limited && item.sale_type === 'stock'

              return (
                <Link
                  key={item.id}
                  to={`/catalog/${item.id}`}
                  className="catalog-item-card"
                >
                  <div className="item-image-wrapper">
                    <img
                      src={imageUrl}
                      alt={item.name}
                    />
                    {item.is_limited && (
                      <div className="limited-badge-overlay">
                        <span className="limited-tag">LIMITED</span>
                        {wasStock && <span className="limited-u-tag">U</span>}
                      </div>
                    )}
                    {isInStock && (
                      <div className="new-badge">NEW</div>
                    )}
                    {isTimerActive && (
                      <>
                        <div className="timer-badge">🕐</div>
                        <div className="new-badge">NEW</div>
                      </>
                    )}
                    {/* Top Right Badges */}
                    <div className="badge-group top-right">
                      {item.demand && (item.demand === 'high' || item.demand === 'very_high') && (
                        <div className="trending-badge" title="Trending / High Demand">🔥</div>
                      )}
                    </div>

                    {/* Bottom Right Badges */}
                    <div className="badge-group bottom-right">
                      {item.is_projected && (
                        <div className="projected-badge" title="Projected: Artificial Price Inflation">⚠️</div>
                      )}
                      {item.is_limited && item.stock_count <= 50 && (
                        <div className="rare-badge" title="Rare Item: 50 or less stock">💎</div>
                      )}
                    </div>
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
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                ‹
              </button>

              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    className={`pagination-btn ${pageNum === currentPage ? 'active' : ''}`}
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                )
              })}

              <button
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage + 1)}
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
