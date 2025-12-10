import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import './Players.css'

const Players = () => {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('') // The actual search query being used
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showOnlineOnly, setShowOnlineOnly] = useState(true)
  const playersPerPage = 20

  useEffect(() => {
    fetchPlayers()
  }, [currentPage, activeSearchQuery, showOnlineOnly])

  const fetchPlayers = async () => {
    setLoading(true)
    try {
      const offset = (currentPage - 1) * playersPerPage
      const response = await axios.get('/api/users', {
        params: {
          limit: playersPerPage,
          offset: offset,
          search: activeSearchQuery,
          online_only: showOnlineOnly ? 'true' : 'false'
        }
      })
      setPlayers(response.data)
      // Estimate total pages (we don't have total count, so we'll show next page if we got full page)
      setTotalPages(response.data.length === playersPerPage ? currentPage + 1 : currentPage)
    } catch (error) {
      console.error('Error fetching players:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setActiveSearchQuery(searchQuery)
    setCurrentPage(1)
    // When searching, show all players (online + offline)
    // When search is cleared, revert to online only
    if (searchQuery.trim() !== '') {
      setShowOnlineOnly(false)
    }
  }

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading && players.length === 0) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="players">
      <div className="container">
        <h1>Players</h1>

        <div className="players-controls" style={{ marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary">Search</button>
          </form>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => {
                setShowOnlineOnly(e.target.checked)
                setCurrentPage(1)
                // When manually toggling, clear search
                if (e.target.checked) {
                  setActiveSearchQuery('')
                  setSearchQuery('')
                }
              }}
            />
            <span>Show online only</span>
          </label>
        </div>

        {players.length === 0 ? (
          <div className="no-players" style={{ textAlign: 'center', padding: '48px', color: '#8c8c8c' }}>
            {activeSearchQuery ? 'No players found matching your search' : 'No players online'}
          </div>
        ) : (
          <>
            <div className="players-list">
              {players.map(player => (
                <Link key={player.id} to={`/players/${player.id}`} className="player-card">
                  <div className="player-info">
                    <div className="player-username">
                      {player.username}
                      {player.is_admin && (
                        <span style={{ marginLeft: '8px', fontSize: '18px' }} title="Admin">🔨</span>
                      )}
                    </div>
                    <div className="player-cash">R${(player.inventory_value || 0).toLocaleString()}</div>
                  </div>
                  <div className="player-joined">
                    Joined {new Date(player.created_at).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span style={{ padding: '0 16px', color: '#b0b0b0' }}>
                  Page {currentPage} {totalPages > currentPage && `of ${totalPages}+`}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={players.length < playersPerPage}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Players
