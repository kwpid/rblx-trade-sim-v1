import { useEffect, useState } from 'react'
import axios from 'axios'
import './Event.css'
import SnowEffect from '../components/SnowEffect'

const Event = () => {
    const [data, setData] = useState({ tokens: 0, challenges: [] })
    const [loading, setLoading] = useState(true)
    const [timeLeft, setTimeLeft] = useState('')
    const [selectedGift, setSelectedGift] = useState(null)
    const [message, setMessage] = useState(null)

    const GIFTS = [
        { id: 'bronze', name: 'Bronze Gift', cost: 100, icon: '🎁', className: 'gift-bronze' },
        { id: 'silver', name: 'Silver Gift', cost: 250, icon: '🎁', className: 'gift-silver' },
        { id: 'gold', name: 'Gold Gift', cost: 500, icon: '🎁', className: 'gift-gold' },
        { id: 'festive', name: 'Festive Gift', cost: 1000, icon: '🎄', className: 'gift-festive' },
        { id: 'frostbitten', name: 'Frostbitten Gift', cost: 5000, icon: '🧊', className: 'gift-frostbitten' }
    ]

    useEffect(() => {
        fetchStatus()
        const timer = setInterval(updateCountdown, 1000)
        return () => clearInterval(timer)
    }, [])

    const fetchStatus = async () => {
        try {
            const res = await axios.get('/api/event/status')
            setData(res.data)
            setLoading(false)
        } catch (error) {
            console.error(error)
            setLoading(false)
        }
    }

    const updateCountdown = () => {
        const end = new Date('2025-01-07T00:00:00')
        const now = new Date()
        const diff = end - now

        if (diff <= 0) {
            setTimeLeft('Event Ended')
            return
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)

        setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`)
    }

    const handleClaim = async (id) => {
        try {
            const res = await axios.post(`/api/event/claim/${id}`)
            if (res.data.success) {
                // Refresh
                fetchStatus()
                // Play sound or effect?
            }
        } catch (error) {
            console.error(error)
            alert(error.response?.data?.error || 'Failed to claim')
        }
    }

    const handleRefresh = async () => {
        if (!window.confirm('Refresh challenges for $100,000 cash?')) return

        try {
            const res = await axios.post('/api/event/refresh')
            if (res.data.success) {
                fetchStatus()
            }
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to refresh')
        }
    }

    const handleBuyGift = async () => {
        if (!selectedGift) return
        try {
            const res = await axios.post('/api/event/buy-gift', { giftId: selectedGift.id })
            if (res.data.success) {
                alert('You opened ' + res.data.item.name + '!')
                fetchStatus()
                setSelectedGift(null)
            } else {
                setMessage(res.data.error || 'Failed to buy gift')
                setSelectedGift(null)
                setTimeout(() => setMessage(null), 3000)
            }
        } catch (error) {
            setMessage(error.response?.data?.error || 'Failed')
            setSelectedGift(null)
            setTimeout(() => setMessage(null), 3000)
        }
    }

    if (loading) return <div className="loading"><div className="spinner"></div></div>

    return (
        <div className="event-page">
            <SnowEffect />

            {/* Background Decor */}
            <div className="event-header">
                <h1>Christmas Event 2024</h1>
                <div className="countdown">Time Remaining: {timeLeft}</div>

                <div className="tokens-display">
                    <span className="token-label">HOLIDAY TOKENS:</span>
                    <span className="token-amount">{data.tokens.toLocaleString()}</span>
                </div>
            </div>

            <div className="container">
                {message && <div className="message-box">{message}</div>}

                {/* Challenges */}
                <div className="challenges-section">
                    <div className="challenges-header">
                        <div className="section-title">
                            <span className="section-icon">📜</span>
                            Active Challenges
                        </div>
                        <button className="refresh-btn" onClick={handleRefresh}>
                            Refresh (R$100k)
                        </button>
                    </div>

                    <div className="challenges-grid">
                        {data.challenges.length === 0 ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#aaa' }}>
                                No active challenges. Refresh or wait for next reset!
                            </div>
                        ) : data.challenges.map(chal => {
                            const progress = (chal.current_value / chal.target_value) * 100
                            const isComplete = chal.current_value >= chal.target_value

                            return (
                                <div key={chal.id} className={`challenge-card ${isComplete ? 'completed' : ''}`}>
                                    <div className="challenge-desc">
                                        {chal.metadata?.description || chal.challenge_type}
                                    </div>
                                    <div className="challenge-progress">
                                        <div className="progress-bar">
                                            <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }}></div>
                                        </div>
                                        <div className="progress-text">
                                            {chal.current_value} / {chal.target_value}
                                        </div>
                                    </div>
                                    <div className="challenge-reward">
                                        <span>+{chal.reward_tokens} Tokens</span>
                                        {isComplete && !chal.is_claimed && (
                                            <button className="claim-btn" onClick={() => handleClaim(chal.id)}>
                                                CLAIM
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Gift Shop */}
                <div className="gifts-section">
                    <div className="section-title">
                        <span className="section-icon">🎁</span>
                        Gift Shop
                    </div>
                    <div className="gifts-grid">
                        {GIFTS.map(gift => (
                            <div
                                key={gift.id}
                                className={`gift-card ${gift.className}`}
                                onClick={() => setSelectedGift(gift)}
                            >
                                <div className="gift-icon">{gift.icon}</div>
                                <div className="gift-name">{gift.name}</div>
                                <div className="gift-cost">{gift.cost} Tokens</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {selectedGift && (
                <div className="modal-overlay" onClick={() => setSelectedGift(null)}>
                    <div className="gift-modal" onClick={e => e.stopPropagation()}>
                        <div className="gift-icon" style={{ fontSize: '64px', marginBottom: '12px' }}>
                            {selectedGift.icon}
                        </div>
                        <h2 className="modal-title">Open {selectedGift.name}?</h2>
                        <p style={{ marginBottom: '24px', color: '#ccc' }}>
                            This will cost <strong>{selectedGift.cost} Tokens</strong>.
                        </p>
                        <div className="modal-btns">
                            <button className="modal-btn cancel" onClick={() => setSelectedGift(null)}>Cancel</button>
                            <button className="modal-btn confirm" onClick={handleBuyGift}>Buy & Open</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Event
