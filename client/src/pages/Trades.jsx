import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { Link } from 'react-router-dom'
import axios from 'axios'
import './Trades.css'

const Trades = () => {
    const { user } = useAuth()
    const { fetchInboundTrades } = useNotifications()
    const [activeTab, setActiveTab] = useState('inbound')
    const [trades, setTrades] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchTrades()
    }, [activeTab])

    const fetchTrades = async () => {
        setLoading(true)
        try {
            const response = await axios.get(`/api/trades?type=${activeTab}`)
            setTrades(response.data)

            // Refresh badge count if we are looking at inbound
            // Or just refresh it generally to ensure sync
            if (activeTab === 'inbound') {
                fetchInboundTrades();
            }
        } catch (error) {
            console.error('Error fetching trades:', error)
        } finally {
            setLoading(false)
        }
    }

    const getStatusLabel = (status) => {
        return status.charAt(0).toUpperCase() + status.slice(1)
    }

    const handleBulkDeclineIncoming = async () => {
        if (!window.confirm(`Are you sure you want to decline all ${trades.length} incoming trade(s)?`)) {
            return
        }

        try {
            const response = await axios.post('/api/trades/bulk/decline-incoming')
            alert(response.data.message || 'Successfully declined all incoming trades')
            fetchTrades() // Refresh the list
        } catch (error) {
            console.error('Error declining incoming trades:', error)
            alert('Failed to decline incoming trades')
        }
    }

    const handleBulkCancelOutbound = async () => {
        if (!window.confirm(`Are you sure you want to cancel all ${trades.length} outbound trade(s)?`)) {
            return
        }

        try {
            const response = await axios.post('/api/trades/bulk/cancel-outbound')
            alert(response.data.message || 'Successfully cancelled all outbound trades')
            fetchTrades() // Refresh the list
        } catch (error) {
            console.error('Error cancelling outbound trades:', error)
            alert('Failed to cancel outbound trades')
        }
    }

    return (
        <div className="trades-container">
            <div className="trades-header">
                <h1>Trades</h1>
            </div>

            <div className="trade-tabs">
                <button
                    className={`trade-tab ${activeTab === 'inbound' ? 'active' : ''}`}
                    onClick={() => setActiveTab('inbound')}
                >
                    Inbound
                </button>
                <button
                    className={`trade-tab ${activeTab === 'outbound' ? 'active' : ''}`}
                    onClick={() => setActiveTab('outbound')}
                >
                    Outbound
                </button>
                <button
                    className={`trade-tab ${activeTab === 'completed' ? 'active' : ''}`}
                    onClick={() => setActiveTab('completed')}
                >
                    Completed
                </button>
                <button
                    className={`trade-tab ${activeTab === 'inactive' ? 'active' : ''}`}
                    onClick={() => setActiveTab('inactive')}
                >
                    Inactive
                </button>
            </div>

            {/* Bulk Action Buttons */}
            {(activeTab === 'inbound' || activeTab === 'outbound') && trades.length > 0 && (
                <div className="bulk-actions">
                    {activeTab === 'inbound' && (
                        <button
                            className="bulk-decline-btn"
                            onClick={handleBulkDeclineIncoming}
                        >
                            Decline All Incoming
                        </button>
                    )}
                    {activeTab === 'outbound' && (
                        <button
                            className="bulk-cancel-btn"
                            onClick={handleBulkCancelOutbound}
                        >
                            Cancel All Outbound
                        </button>
                    )}
                </div>
            )}

            <div className="trades-list">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner"></div>
                    </div>
                ) : trades.length === 0 ? (
                    <div className="no-trades">No {activeTab} trades found.</div>
                ) : (
                    trades.map(trade => {
                        const isSender = trade.sender_id === user.id
                        const partner = isSender ? trade.receiver : trade.sender

                        // Calculate values from user's perspective
                        const myValue = isSender ? trade.sender_value : trade.receiver_value
                        const theirValue = isSender ? trade.receiver_value : trade.sender_value
                        const diff = theirValue - myValue
                        const diffPercent = myValue > 0 ? (diff / myValue) * 100 : 0

                        // Determine color
                        let bgColor
                        if (Math.abs(diffPercent) <= 5) {
                            bgColor = 'rgba(255, 193, 7, 0.08)' // Yellow for fair
                        } else if (diff > 0) {
                            bgColor = 'rgba(0, 176, 111, 0.08)' // Green for profit
                        } else {
                            bgColor = 'rgba(255, 107, 107, 0.08)' // Red for loss
                        }

                        return (
                            <Link
                                key={trade.id}
                                to={`/trades/${trade.id}`}
                                className="trade-card"
                                style={{ backgroundColor: bgColor }}
                            >
                                <div className="trade-card-left">
                                    <div className="trade-info">
                                        <span className="trade-partner-name">{partner?.username}</span>
                                        <span className="trade-date">{new Date(trade.created_at).toLocaleString()}</span>
                                        {/* Value Comparison */}
                                        <div className="trade-value-comparison">
                                            <span className="value-send">${myValue?.toLocaleString() || 0}</span>
                                            <span className="value-separator">/</span>
                                            <span className="value-receive">${theirValue?.toLocaleString() || 0}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="trade-card-right">
                                    <div className={`trade-status-indicator ${activeTab}`}>
                                        {getStatusLabel(trade.status)}
                                    </div>
                                    <button className="trade-action-btn">
                                        Open
                                    </button>
                                </div>
                            </Link>
                        )
                    })
                )}
            </div>
        </div>
    )
}

export default Trades
