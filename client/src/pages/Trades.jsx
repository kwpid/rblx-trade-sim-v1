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

                        return (
                            <Link
                                key={trade.id}
                                to={`/trades/${trade.id}`}
                                className="trade-card"
                            >
                                <div className="trade-card-left">
                                    <div className="trade-info">
                                        <span className="trade-partner-name">{partner?.username}</span>
                                        <span className="trade-date">{new Date(trade.created_at).toLocaleString()}</span>
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
