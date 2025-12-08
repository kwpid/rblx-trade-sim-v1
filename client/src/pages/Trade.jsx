import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import axios from 'axios'
import './Trade.css'

const Trade = () => {
  const { user } = useAuth()
  const [trades, setTrades] = useState([])
  const [inventory, setInventory] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateTrade, setShowCreateTrade] = useState(false)
  const [selectedRecipient, setSelectedRecipient] = useState('')
  const [offeredItems, setOfferedItems] = useState([])
  const [requestedItems, setRequestedItems] = useState([])
  const [offeredCash, setOfferedCash] = useState(0)
  const [requestedCash, setRequestedCash] = useState(0)
  const { showPopup } = useNotifications()

  useEffect(() => {
    if (user) {
      fetchTrades()
      fetchInventory()
      fetchPlayers()
    }
  }, [user])

  const fetchTrades = async () => {
    try {
      const response = await axios.get('/api/trades')
      setTrades(response.data)
    } catch (error) {
      console.error('Error fetching trades:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchInventory = async () => {
    try {
      const response = await axios.get(`/api/users/${user.id}/inventory`)
      setInventory(response.data.filter(item => !item.is_for_sale))
    } catch (error) {
      console.error('Error fetching inventory:', error)
    }
  }

  const fetchPlayers = async () => {
    try {
      const response = await axios.get('/api/users')
      setPlayers(response.data.filter(p => p.id !== user.id))
    } catch (error) {
      console.error('Error fetching players:', error)
    }
  }

  const handleCreateTrade = async () => {
    try {
      await axios.post('/api/trades', {
        recipient_id: selectedRecipient,
        offered_items: offeredItems,
        requested_items: requestedItems,
        offered_cash: offeredCash,
        requested_cash: requestedCash
      })
      showPopup('Trade offer sent!', 'success')
      setShowCreateTrade(false)
      fetchTrades()
    } catch (error) {
      showPopup(error.response?.data?.error || 'Failed to create trade', 'error')
    }
  }

  const handleAcceptTrade = async (tradeId) => {
    try {
      await axios.post(`/api/trades/${tradeId}/accept`)
      showPopup('Trade accepted!', 'success')
      fetchTrades()
      fetchInventory()
    } catch (error) {
      showPopup(error.response?.data?.error || 'Failed to accept trade', 'error')
    }
  }

  const handleDeclineTrade = async (tradeId) => {
    try {
      await axios.post(`/api/trades/${tradeId}/decline`)
      showPopup('Trade declined', 'info')
      fetchTrades()
    } catch (error) {
      showPopup('Failed to decline trade', 'error')
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="trade">
      <div className="container">
        <div className="trade-header">
          <h1>Trades</h1>
          <button className="btn" onClick={() => setShowCreateTrade(true)}>
            Create Trade
          </button>
        </div>
        <div className="trades-list">
          {trades.length === 0 ? (
            <div className="empty-trades">No trades</div>
          ) : (
            trades.map(trade => (
              <div key={trade.id} className="trade-card">
                <div className="trade-info">
                  <div>
                    <strong>{trade.sender?.username}</strong> → <strong>{trade.recipient?.username}</strong>
                  </div>
                  <div className="trade-status">{trade.status}</div>
                </div>
                <div className="trade-details">
                  <div>
                    <h3>Offered:</h3>
                    {trade.offered_cash > 0 && <p>R${trade.offered_cash}</p>}
                    <p>{trade.offered_items?.length || 0} items</p>
                  </div>
                  <div>
                    <h3>Requested:</h3>
                    {trade.requested_cash > 0 && <p>R${trade.requested_cash}</p>}
                    <p>{trade.requested_items?.length || 0} items</p>
                  </div>
                </div>
                {trade.recipient_id === user.id && trade.status === 'pending' && (
                  <div className="trade-actions">
                    <button className="btn" onClick={() => handleAcceptTrade(trade.id)}>
                      Accept
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleDeclineTrade(trade.id)}>
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {showCreateTrade && (
        <div className="modal-overlay" onClick={() => setShowCreateTrade(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create Trade</h2>
            <div className="form-group">
              <label>Recipient</label>
              <select
                value={selectedRecipient}
                onChange={(e) => setSelectedRecipient(e.target.value)}
                className="input"
              >
                <option value="">Select player</option>
                {players.map(player => (
                  <option key={player.id} value={player.id}>{player.username}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Offered Cash (R$)</label>
              <input
                type="number"
                value={offeredCash}
                onChange={(e) => setOfferedCash(parseFloat(e.target.value) || 0)}
                className="input"
                min="0"
              />
            </div>
            <div className="form-group">
              <label>Requested Cash (R$)</label>
              <input
                type="number"
                value={requestedCash}
                onChange={(e) => setRequestedCash(parseFloat(e.target.value) || 0)}
                className="input"
                min="0"
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={handleCreateTrade}>
                Send Trade
              </button>
              <button className="btn btn-secondary" onClick={() => setShowCreateTrade(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Trade

