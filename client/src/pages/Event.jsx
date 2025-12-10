import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import './Event.css'
import SnowEffect from '../components/SnowEffect'

const Event = () => {
    const [data, setData] = useState({ tokens: 0, challenges: [] })
    const [giftDetails, setGiftDetails] = useState([]) // Stores gifts with possible items
    const [loading, setLoading] = useState(true)
    const [timeLeft, setTimeLeft] = useState('')

    // Modal / Rolling State
    const [selectedGift, setSelectedGift] = useState(null)
    const [isRolling, setIsRolling] = useState(false)
    const [wonItem, setWonItem] = useState(null)
    const [rollingItems, setRollingItems] = useState([]) // Array for the visual strip
    const [rollTransition, setRollTransition] = useState('none')
    const [rollPosition, setRollPosition] = useState(0)

    const [message, setMessage] = useState(null)

    // Refs
    const rouletteRef = useRef(null)

    useEffect(() => {
        fetchStatus()
        fetchGiftDetails()
        const timer = setInterval(updateCountdown, 1000)
        return () => clearInterval(timer)
    }, [])

    const fetchStatus = async () => {
        try {
            const res = await axios.get('/api/event/status')
            setData(res.data)
        } catch (error) { console.error(error) }
    }

    const fetchGiftDetails = async () => {
        try {
            const res = await axios.get('/api/event/gift-details')
            if (res.data.gifts) {
                setGiftDetails(res.data.gifts)
                setLoading(false)
            }
        } catch (error) { console.error(error); setLoading(false) }
    }

    const updateCountdown = () => {
        const end = new Date('2026-01-07T00:00:00')
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
            if (res.data.success) fetchStatus()
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to claim')
        }
    }

    const handleRefresh = async () => {
        if (!window.confirm('Refresh challenges for R$100,000?')) return
        try {
            const res = await axios.post('/api/event/refresh')
            if (res.data.success) fetchStatus()
        } catch (error) {
            alert(error.response?.data?.error || 'Failed to refresh')
        }
    }

    // --- Rolling Logic ---

    const prepareRoll = (details) => {
        // Generate a long strip of simulated items
        // We need 'filler' items. We can use the 'possible_items' from the gift details.
        if (!details || !details.possible_items) return [];

        const fillers = [];
        const pool = details.possible_items;

        // Create 50 items for the strip
        for (let i = 0; i < 50; i++) {
            // Pick random weighted by chance (visual simulation)
            // Or just random for visual chaos? Weighted is better.
            const rnd = Math.random() * 100;
            let accum = 0;
            let picked = pool[0];
            for (const item of pool) {
                accum += item.chance;
                if (rnd <= accum) {
                    picked = item;
                    break;
                }
            }
            fillers.push(picked);
        }
        return fillers;
    }

    const openGiftModal = (gift) => {
        if (loading) return;
        setSelectedGift(gift)
        setWonItem(null)
        setIsRolling(false)
        setRollPosition(0)
        setRollTransition('none')
    }

    const handleBuyAndRoll = async () => {
        if (!selectedGift || isRolling) return

        try {
            // 1. Buy API
            const res = await axios.post('/api/event/buy-gift', { giftId: selectedGift.id })

            if (!res.data.success) {
                setMessage(res.data.error || 'Failed')
                return
            }

            const won = res.data.item
            // Refresh tokens immediately behind the scenes
            fetchStatus()

            // 2. Setup Animation
            setIsRolling(true)

            // Build the strip
            // We want the winner to be at a fixed index, say 35 (out of 50).
            const strip = prepareRoll(selectedGift);
            // Inject winner
            const WIN_INDEX = 35;
            strip[WIN_INDEX] = won; // Force the winner at this spot

            setRollingItems(strip)

            // 3. Start Animation
            // Each card is e.g. 100px wide + gap.
            // Screen center calculation?
            // Let's assume CardWidth = 120px + 10px margin = 130px.
            // We want index 35 to be centered.
            // Center of container = ContainerWidth / 2.
            // Target Position = - (Index * 130) + (ContainerWidth / 2) - (CardWidth / 2).

            // Reset first
            setRollTransition('none')
            setRollPosition(0)

            // Trigger reflow/timeout to start animation
            setTimeout(() => {
                const CARD_WIDTH = 130;
                // Randomize slightly within the card to create tension
                const randomOffset = Math.floor(Math.random() * 80) - 40;

                const targetPixel = (WIN_INDEX * CARD_WIDTH) - (300) + (65) + randomOffset;
                // 300 is approx half of modal width 600? Adjusted later in CSS logic.
                // Simpler: Just scroll relative to start.

                setRollTransition('transform 4s cubic-bezier(0.1, 0, 0.2, 1)'); // Ease out easing
                setRollPosition(-targetPixel)

                // 4. End Handling
                setTimeout(() => {
                    setWonItem(won)
                    setIsRolling(false) // Keep modal open strictly speaking, but change state to 'Result'
                }, 4000)
            }, 50)

        } catch (error) {
            setMessage(error.response?.data?.error || 'Failed')
            setTimeout(() => setMessage(null), 3000)
        }
    }

    if (loading) return <div className="loading"><div className="spinner"></div></div>

    // Helper for rarity color
    const getRarityColor = (rarity) => {
        if (rarity === 'LEGENDARY') return '#ffcc00';
        if (rarity === 'RARE') return '#ff4444';
        if (rarity === 'UNCOMMON') return '#00a2ff';
        return '#b0b0b0';
    }

    return (
        <div className="event-page">
            <SnowEffect />

            <div className="event-header">
                <h1>Holiday Event 2024</h1>
                <div className="countdown">{timeLeft}</div>

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
                        {data.challenges.length > 0 && data.challenges.every(c => c.current_value >= c.target_value) && (
                            <button className="refresh-btn" onClick={handleRefresh}>
                                Refresh (R$100k)
                            </button>
                        )}
                    </div>

                    <div className="challenges-grid">
                        {data.challenges.length === 0 ? (
                            <div className="empty-state">No active challenges.</div>
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
                                        <div className="progress-text">{chal.current_value} / {chal.target_value}</div>
                                    </div>
                                    <div className="challenge-reward">
                                        <span>+{chal.reward_tokens} Tokens</span>
                                        {isComplete && !chal.is_claimed && (
                                            <button className="claim-btn" onClick={() => handleClaim(chal.id)}>CLAIM</button>
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
                        {giftDetails.map(gift => {
                            // Find 'best' item for preview image? Or just Gift Icon
                            return (
                                <div key={gift.id} className={`gift-card gift-${gift.id}`} onClick={() => openGiftModal(gift)}>
                                    <div className="gift-icon">🎁</div>
                                    <div className="gift-name">{gift.name}</div>
                                    <div className="gift-cost">{gift.cost} Tokens</div>
                                    <div className="gift-hover-hint">Click to Preview</div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {selectedGift && (
                <div className="modal-overlay" onClick={() => !isRolling && setSelectedGift(null)}>
                    <div className="gift-modal" onClick={e => e.stopPropagation()}>

                        {!isRolling && !wonItem && (
                            <>
                                <div className="gift-header">
                                    <div className="gift-icon-large">🎁</div>
                                    <h2>{selectedGift.name}</h2>
                                    <div className="cost-pill">{selectedGift.cost} Tokens</div>
                                </div>

                                <div className="gift-contents">
                                    <h3>Possible Contents</h3>
                                    <div className="contents-list">
                                        {selectedGift.possible_items?.map((item, idx) => (
                                            <div key={idx} className="content-item" style={{ borderColor: getRarityColor(item.rarity) }}>
                                                <img src={item.image_url} alt={item.name} />
                                                <div className="item-info">
                                                    <div className="item-name" style={{ color: getRarityColor(item.rarity) }}>{item.name}</div>
                                                    <div className="item-chance">{item.chance.toFixed(2)}%</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="modal-btns">
                                    <button className="modal-btn cancel" onClick={() => setSelectedGift(null)}>Close</button>
                                    <button className="modal-btn confirm" onClick={handleBuyAndRoll}>Buy & Open</button>
                                </div>
                            </>
                        )}

                        {(isRolling || wonItem) && (
                            <div className="rolling-container">
                                {wonItem ? (
                                    <div className="win-display">
                                        <h1>You Unboxed:</h1>
                                        <div className="win-card" style={{ boxShadow: `0 0 30px ${getRarityColor(wonItem.rarity)}` }}>
                                            <img src={wonItem.image_url} alt={wonItem.name} />
                                            <h2 style={{ color: getRarityColor(wonItem.rarity) }}>{wonItem.name}</h2>
                                            <p>{wonItem.rarity}</p>
                                        </div>
                                        <button className="modal-btn confirm" onClick={() => { setSelectedGift(null); setWonItem(null); }}>Awesome!</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="roulette-window">
                                            <div className="roulette-marker"></div>
                                            <div
                                                className="roulette-strip"
                                                style={{
                                                    transform: `translateX(${rollPosition}px)`,
                                                    transition: rollTransition
                                                }}
                                            >
                                                {rollingItems.map((item, idx) => (
                                                    <div kye={idx} className="roulette-card" style={{ borderColor: getRarityColor(item.rarity) }}>
                                                        <img src={item.image_url} alt={item.name} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="rolling-text">Rolling...</div>
                                    </>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    )
}

export default Event

