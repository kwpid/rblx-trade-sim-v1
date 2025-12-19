import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import axios from 'axios'
import ItemTooltipGraph from '../components/ItemTooltipGraph'
import './TradeWindow.css'

const TradeWindow = () => {
    const { id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const { user } = useAuth()
    const { showPopup } = useNotifications()

    // Tooltip State
    const [hoveredItemId, setHoveredItemId] = useState(null)
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

    const handleMouseEnter = (e, itemId) => {
        setHoveredItemId(itemId)
        setMousePos({ x: e.clientX, y: e.clientY })
    }

    const handleMouseMove = (e) => {
        setMousePos({ x: e.clientX, y: e.clientY })
    }

    const handleMouseLeave = () => {
        setHoveredItemId(null)
    }

    // Clear tooltip on scroll/click to prevent "stuck" charts
    useEffect(() => {
        const handleClear = () => setHoveredItemId(null)
        window.addEventListener('scroll', handleClear)
        window.addEventListener('click', handleClear)
        return () => {
            window.removeEventListener('scroll', handleClear)
            window.removeEventListener('click', handleClear)
        }
    }, [])

    const [loading, setLoading] = useState(true)
    const [partner, setPartner] = useState(null)
    const [status, setStatus] = useState('pending')
    const [tradeDetails, setTradeDetails] = useState(null)

    // Inventories
    const [myInventory, setMyInventory] = useState([])
    const [partnerInventory, setPartnerInventory] = useState([])

    // Search
    const [mySearch, setMySearch] = useState('')
    const [theirSearch, setTheirSearch] = useState('')

    // Offers
    const [myOffer, setMyOffer] = useState([]) // Items I am giving
    const [theirOffer, setTheirOffer] = useState([]) // Items they are giving

    const [isNewTrade, setIsNewTrade] = useState(false)
    const queryParams = new URLSearchParams(location.search)
    const partnerId = queryParams.get('partner')

    useEffect(() => {
        if (id === 'new') {
            setIsNewTrade(true)
            if (partnerId) {
                fetchPartnerAndInventories(partnerId)
            }
        } else {
            fetchExistingTrade()
        }
    }, [id, partnerId])

    const fetchPartnerAndInventories = async (pid) => {
        try {
            setLoading(true)
            const userRes = await axios.get(`/api/users/${pid}`)
            setPartner(userRes.data)

            const myInvRes = await axios.get(`/api/users/${user?.id}/inventory`)
            setMyInventory(processInventory(myInvRes.data))

            const theirInvRes = await axios.get(`/api/users/${pid}/inventory`)
            setPartnerInventory(processInventory(theirInvRes.data))
        } catch (error) {
            console.error(error)
            showPopup('Failed to load trade data', 'error')
        } finally {
            setLoading(false)
        }
    }

    const fetchExistingTrade = async () => {
        try {
            setLoading(true)
            const res = await axios.get(`/api/trades/${id}`)
            const trade = res.data
            setTradeDetails(trade)
            setStatus(trade.status)

            const isSender = trade.sender_id === user.id
            setPartner(isSender ? trade.receiver : trade.sender)

            // Fetch inventories for serial calculation
            const [senderInvRes, receiverInvRes] = await Promise.all([
                axios.get(`/api/users/${trade.sender_id}/inventory`),
                axios.get(`/api/users/${trade.receiver_id}/inventory`)
            ])
            const senderInv = senderInvRes.data
            const receiverInv = receiverInvRes.data

            // Helper to find serial
            const processWithSerial = (tradeItem, inventory) => {
                const userItem = tradeItem.user_items
                // Try to find in inventory first (full object), or use trade item data
                const foundInInv = inventory.find(i => i.id === userItem.id)
                const serialNumber = (foundInInv && foundInInv.serial_number) || userItem.serial_number || '#'
                return processItem(userItem, serialNumber)
            }

            const myItems = trade.trade_items
                .filter(i => isSender ? i.side === 'sender' : i.side === 'receiver')
                .map(i => processWithSerial(i, isSender ? senderInv : receiverInv))

            const theirItems = trade.trade_items
                .filter(i => isSender ? i.side === 'receiver' : i.side === 'sender')
                .map(i => processWithSerial(i, isSender ? receiverInv : senderInv))

            setMyOffer(myItems)
            setTheirOffer(theirItems)
        } catch (error) {
            console.error(error)
            showPopup('Failed to load trade', 'error')
        } finally {
            setLoading(false)
        }
    }

    const processInventory = (items) => {
        const tradableItems = items.filter(item => item.items?.is_limited === true)
        const processed = tradableItems.map(userItem => {
            const serialNumber = userItem.serial_number || '#'
            return processItem(userItem, serialNumber)
        })
        // Sort by value (descending)
        return processed.sort((a, b) => (b.calculatedValue || 0) - (a.calculatedValue || 0))
    }

    const processItem = (userItem, serialNumber = null) => {
        const item = userItem.items || {}
        const value = item.value || 0
        const rap = item.rap || 0

        // Status Logic - Match Catalog.jsx 1:1
        const isProjected = item.is_projected || (value > 0 && rap > (value * 1.25 + 50))
        const isTrending = item.demand === 'high' || item.demand === 'very_high'
        const isRare = item.is_limited && (item.stock_count <= 50 || item.rarity === 'rare' || item.rarity === 'insane')

        return {
            ...userItem,
            calculatedValue: value,
            rap: rap,
            serialNumber: serialNumber || userItem.serialNumber,
            isProjected,
            isTrending,
            isRare,
            // Carry over catalog specific flags for 1:1 rendering
            saleType: item.sale_type,
            isLimited: item.is_limited,
            tag: userItem.tag // Pass tag through
        }
    }

    const toggleItem = (item, side) => {
        if (!isNewTrade) return

        if (side === 'mine') {
            // Cannot trade NFT items (self-imposed restriction? Maybe allow user to ignore their own tag? 
            // User request: "Not For Trade logic: if an item is tagged as NFT, then that item cant be traded (for that player ofc)"
            // Usually NFT means *I* don't want to trade it. So if I click it, maybe I should be warned or blocked?
            // "if a player opens a trade menu with that user, they will see the items, but their card will be disabled"
            // So if I trade with YOU, YOUR NFT items are disabled. MY NFT items? I should be able to add them (it's my choice).
            // But let's follow the "card will be disabled" rule for the PARTNER.

            if (myOffer.find(i => i.id === item.id)) {
                setMyOffer(myOffer.filter(i => i.id !== item.id))
            } else {
                if (item.tag === 'nft') return showPopup('This item is marked Not For Trade', 'error');

                if (myOffer.length >= 7) return showPopup('Max 7 items', 'error')
                setMyOffer([...myOffer, item])
            }
        } else {
            // Partner's side
            if (theirOffer.find(i => i.id === item.id)) {
                setTheirOffer(theirOffer.filter(i => i.id !== item.id))
            } else {
                if (item.tag === 'nft') return showPopup('This item is marked Not For Trade', 'error');

                if (theirOffer.length >= 7) return showPopup('Max 7 items', 'error')
                setTheirOffer([...theirOffer, item])
            }
        }
    }

    const calculateTotal = (items) => {
        return items.reduce((sum, i) => sum + (i.calculatedValue || 0), 0)
    }

    const handleSendTrade = async () => {
        if (myOffer.length === 0 && theirOffer.length === 0) return showPopup('Select items to trade', 'error')

        try {
            await axios.post('/api/trades', {
                receiver_id: partner.id,
                sender_item_ids: myOffer.map(i => i.id),
                receiver_item_ids: theirOffer.map(i => i.id)
            })
            showPopup('Trade sent!', 'success')
            navigate('/trades')
        } catch (error) {
            showPopup(error.response?.data?.error || 'Failed to send trade', 'error')
        }
    }

    const handleAccept = async () => {
        try {
            await axios.post(`/api/trades/${id}/accept`)
            showPopup('Trade accepted!', 'success')
            fetchExistingTrade()
        } catch (error) {
            showPopup(error.response?.data?.error || 'Failed to accept', 'error')
        }
    }

    const handleDecline = async () => {
        try {
            await axios.post(`/api/trades/${id}/decline`)
            showPopup('Trade declined', 'info')
            navigate('/trades')
        } catch (error) {
            showPopup(error.response?.data?.error || 'Failed to decline', 'error')
        }
    }

    const handleCancel = async () => {
        try {
            await axios.post(`/api/trades/${id}/cancel`)
            showPopup('Trade cancelled', 'info')
            navigate('/trades')
        } catch (error) {
            showPopup(error.response?.data?.error || 'Failed to cancel', 'error')
        }
    }

    const handleProof = async () => {
        try {
            await axios.post(`/api/trades/${id}/proof`)
            showPopup('Trade proofed to Discord!', 'success')
            fetchExistingTrade() // Refresh to update is_proofed status
        } catch (error) {
            showPopup(error.response?.data?.error || 'Failed to proof', 'error')
        }
    }

    const handleValueRequest = async () => {
        try {
            await axios.post(`/api/trades/${id}/value-request`)
            showPopup('Value change request submitted!', 'success')
            fetchExistingTrade() // Refresh to update status
        } catch (error) {
            showPopup(error.response?.data?.error || 'Failed to submit value request', 'error')
        }
    }

    // Determine Labels based on status
    const getMyLabel = () => {
        if (status === 'accepted') return 'You gave'
        return 'You will give'
    }

    const getTheirLabel = () => {
        if (status === 'accepted') return 'You received' // From my perspective
        return 'They will give' // or "Your Request" as per reference image
    }

    // Filter inventories
    const filteredMyInv = myInventory.filter(i => i.items?.name.toLowerCase().includes(mySearch.toLowerCase()))
    const filteredTheirInv = partnerInventory.filter(i => i.items?.name.toLowerCase().includes(theirSearch.toLowerCase()))

    if (loading) return <div className="loading-container"><div className="spinner"></div></div>

    // Layout for New Trade (Reference Image Style)
    if (isNewTrade) {
        return (
            <div className="trade-window-container">
                {hoveredItemId && (
                    <div style={{ position: 'fixed', left: mousePos.x + 15, top: mousePos.y + 15, zIndex: 9999, pointerEvents: 'none' }}>
                        <ItemTooltipGraph itemId={hoveredItemId} />
                    </div>
                )}
                <div className="trade-header-title">Trade with {partner?.username}</div>

                <div className="trade-layout-grid">
                    {/* Left Column: Inventories */}
                    <div className="inventories-column">
                        {/* My Inventory */}
                        <div className="inventory-section trade-window-inventory">
                            <div className="inv-header">
                                <h3>Your Inventory</h3>
                                <input
                                    type="text"
                                    className="inv-dropdown"
                                    placeholder="Search"
                                    value={mySearch}
                                    onChange={(e) => setMySearch(e.target.value)}
                                />
                            </div>
                            <div className="inv-items-grid">
                                {filteredMyInv.map(item => {
                                    const isSelected = myOffer.find(i => i.id === item.id)
                                    const itm = item.items || {}
                                    const wasStock = itm.sale_type === 'stock'

                                    return (
                                        <div
                                            key={item.id}
                                            className={`inv-card ${isSelected ? 'selected' : ''} ${item.tag === 'nft' ? 'disabled-item' : ''}`}
                                            onClick={() => toggleItem(item, 'mine')}
                                            onMouseEnter={(e) => handleMouseEnter(e, itm.id)}
                                            onMouseMove={handleMouseMove}
                                            onMouseLeave={handleMouseLeave}
                                            style={item.tag === 'nft' ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                        >
                                            <div className="inv-card-img">
                                                <div className="serial-badge">#{item.serialNumber || '?'}</div>

                                                {/* Item Tag */}
                                                {item.tag && (
                                                    <div className="item-tag-overlay" style={{ top: '40px' }}>
                                                        {item.tag === 'nft' && <span className="tag-icon nft-icon">🚫</span>}
                                                        {item.tag === 'op' && <span className="tag-icon op-icon">OP</span>}
                                                        {item.tag === 'upgrade' && <span className="tag-icon upgrade-icon">↗️</span>}
                                                        {item.tag === 'downgrade' && <span className="tag-icon downgrade-icon">↘️</span>}
                                                    </div>
                                                )}

                                                {/* Status Badges - Match Catalog */}
                                                <div className="badge-group top-right">
                                                    {item.isTrending && <div className="trending-badge" title="Trending / High Demand">🔥</div>}
                                                </div>

                                                <div className="badge-group bottom-right">
                                                    {item.isProjected && <div className="projected-badge" title="Projected: Artificial Price Inflation">⚠️</div>}
                                                    {item.isRare && <div className="rare-badge" title="Rare Item">💎</div>}
                                                </div>

                                                {itm.is_limited && (
                                                    <div className="limited-badge-overlay">
                                                        <span className="limited-tag">LIMITED</span>
                                                        {wasStock && <span className="limited-u-tag">U</span>}
                                                    </div>
                                                )}

                                                <img
                                                    src={itm.image_url}
                                                    alt={itm.name}
                                                />
                                            </div>
                                            <div className="inv-card-details">
                                                <div className="inv-card-name">{itm.name}</div>
                                                <div className="inv-card-value">${item.calculatedValue.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    )
                                })}
                                {filteredMyInv.length === 0 && <div className="no-items">No items found</div>}
                            </div>
                        </div>

                        {/* Partner Inventory */}
                        <div className="inventory-section trade-window-inventory">
                            <div className="inv-header">
                                <h3>{partner?.username}'s Inventory</h3>
                                <input
                                    type="text"
                                    className="inv-dropdown"
                                    placeholder="Search"
                                    value={theirSearch}
                                    onChange={(e) => setTheirSearch(e.target.value)}
                                />
                            </div>
                            <div className="inv-items-grid">
                                {filteredTheirInv.map(item => {
                                    const isSelected = theirOffer.find(i => i.id === item.id)
                                    const itm = item.items || {}
                                    const wasStock = itm.sale_type === 'stock'
                                    return (
                                        <div
                                            key={item.id}
                                            className={`inv-card ${isSelected ? 'selected' : ''} ${item.tag === 'nft' ? 'disabled-item' : ''}`}
                                            onClick={() => toggleItem(item, 'theirs')}
                                            onMouseEnter={(e) => handleMouseEnter(e, itm.id)}
                                            onMouseMove={handleMouseMove}
                                            onMouseLeave={handleMouseLeave}
                                            style={item.tag === 'nft' ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                        >
                                            <div className="inv-card-img">
                                                <div className="serial-badge">#{item.serialNumber || '?'}</div>

                                                {/* Item Tag */}
                                                {item.tag && (
                                                    <div className="item-tag-overlay" style={{ top: '40px' }}>
                                                        {item.tag === 'nft' && <span className="tag-icon nft-icon">🚫</span>}
                                                        {item.tag === 'op' && <span className="tag-icon op-icon">OP</span>}
                                                        {item.tag === 'upgrade' && <span className="tag-icon upgrade-icon">↗️</span>}
                                                        {item.tag === 'downgrade' && <span className="tag-icon downgrade-icon">↘️</span>}
                                                    </div>
                                                )}

                                                <div className="badge-group top-right">
                                                    {item.isTrending && <div className="trending-badge" title="Trending">🔥</div>}
                                                </div>
                                                <div className="badge-group bottom-right">
                                                    {item.isProjected && <div className="projected-badge" title="Projected">⚠️</div>}
                                                    {item.isRare && <div className="rare-badge" title="Rare">💎</div>}
                                                </div>
                                                {itm.is_limited && (
                                                    <div className="limited-badge-overlay">
                                                        <span className="limited-tag">LIMITED</span>
                                                        {wasStock && <span className="limited-u-tag">U</span>}
                                                    </div>
                                                )}
                                                <img src={itm.image_url} alt={itm.name} />
                                            </div>
                                            <div className="inv-card-details">
                                                <div className="inv-card-name">{itm.name}</div>
                                                <div className="inv-card-value">${item.calculatedValue.toLocaleString()}</div>
                                            </div>
                                        </div>
                                    )
                                })}
                                {filteredTheirInv.length === 0 && <div className="no-items">No items found</div>}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Offers */}
                    {/* Right Column: Offers */}
                    <div className="offers-column">
                        <div className="offers-scroll-area">
                            {/* My Offer */}
                            <div className="offer-section">
                                <div className="offer-header">Your Offer</div>
                                <div className="offer-slots">
                                    {myOffer.map(item => (
                                        <div
                                            key={item.id}
                                            className="offer-slot-item"
                                        >
                                            <div className="slot-img"><img src={item.items?.image_url} alt="" /></div>
                                            <div className="slot-info">
                                                <div className="slot-name">{item.items?.name}</div>
                                                <div className="slot-val">${item.calculatedValue.toLocaleString()}</div>
                                            </div>
                                            <button className="slot-remove-btn" onClick={() => toggleItem(item, 'mine')}>×</button>
                                        </div>
                                    ))}
                                    {Array.from({ length: Math.max(0, 7 - myOffer.length) }).map((_, i) => (
                                        <div key={i} className="empty-slot"></div>
                                    ))}
                                </div>
                                <div className="offer-total">
                                    <span>Total Value:</span>
                                    <span>${calculateTotal(myOffer).toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Their Offer */}
                            <div className="offer-section">
                                <div className="offer-header">Your Request</div>
                                <div className="offer-slots">
                                    {theirOffer.map(item => (
                                        <div
                                            key={item.id}
                                            className="offer-slot-item"
                                        >
                                            <div className="slot-img"><img src={item.items?.image_url} alt="" /></div>
                                            <div className="slot-info">
                                                <div className="slot-name">{item.items?.name}</div>
                                                <div className="slot-val">${item.calculatedValue.toLocaleString()}</div>
                                            </div>
                                            <button className="slot-remove-btn" onClick={() => toggleItem(item, 'theirs')}>×</button>
                                        </div>
                                    ))}
                                    {Array.from({ length: Math.max(0, 7 - theirOffer.length) }).map((_, i) => (
                                        <div key={i} className="empty-slot"></div>
                                    ))}
                                </div>
                                <div className="offer-total">
                                    <span>Total Value:</span>
                                    <span>${calculateTotal(theirOffer).toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="offer-section">
                                <div className="value-comparison" style={{ backgroundColor: (calculateTotal(theirOffer) - calculateTotal(myOffer)) >= 0 ? 'rgba(0, 176, 111, 0.1)' : 'rgba(255, 107, 107, 0.1)' }}>
                                    <div className="value-comparison-label">VALUE COMPARISON</div>
                                    <div className="value-comparison-values">
                                        <span style={{ color: '#aaa' }}>${calculateTotal(myOffer).toLocaleString()}</span>
                                        <span style={{ margin: '0 10px' }}>→</span>
                                        <span style={{ color: '#00ff88' }}>${calculateTotal(theirOffer).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="offers-actions-sticky">
                            <button
                                className="make-offer-btn"
                                disabled={myOffer.length === 0 && theirOffer.length === 0}
                                onClick={handleSendTrade}
                            >
                                Send Trade
                            </button>
                            <button className="cancel-btn-styled" onClick={() => navigate(-1)}>Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Layout for Viewing Existing Trade (Simplified reused components or custom)
    // Using a simpler side-by-side view for history/actions
    const isReceiver = tradeDetails?.receiver_id === user?.id
    const isSender = tradeDetails?.sender_id === user?.id

    return (
        <div className="trade-window-container">
            {hoveredItemId && (
                <div style={{ position: 'fixed', left: mousePos.x + 15, top: mousePos.y + 15, zIndex: 9999, pointerEvents: 'none' }}>
                    <ItemTooltipGraph itemId={hoveredItemId} />
                </div>
            )}

            <div className="trade-header-title">
                Trade with {partner?.username}
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '5px' }}>
                    <span className={`view-status-badge ${status}`} style={{
                        backgroundColor: status === 'accepted' ? '#00b06f' : status === 'declined' ? '#ff6b6b' : '#00a2ff',
                        color: '#fff',
                        fontSize: '14px',
                        padding: '4px 12px',
                        borderRadius: '4px'
                    }}>
                        {status.toUpperCase()}
                    </span>
                    {tradeDetails?.created_at && (
                        <span style={{ fontSize: '14px', color: '#8c8c8c', fontWeight: 'normal' }}>
                            {new Date(tradeDetails.created_at).toLocaleString()}
                        </span>
                    )}
                </div>
            </div>

            <div className="trade-layout-grid">
                <div className="inventories-column"> {/* Reuse column structure but content differs */}
                    <div className="view-mode-container">
                        <div className="offer-section" style={{ background: '#232527', padding: '20px', borderRadius: '8px' }}>
                            <div className="view-section-header">{getMyLabel()}</div>
                            <div className="view-items-row">
                                {myOffer.map(item => {
                                    const itm = item.items || {}
                                    const wasStock = itm.sale_type === 'stock'
                                    return (
                                        <Link
                                            to={`/catalog/${itm.id}`}
                                            key={item.id}
                                            className="inv-card"
                                            style={{ width: '120px' }}
                                            onMouseEnter={(e) => handleMouseEnter(e, itm.id)}
                                            onMouseMove={handleMouseMove}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <div className="inv-card-img">
                                                <div className="serial-badge">#{item.serialNumber || '?'}</div>
                                                <div className="badge-group top-right">
                                                    {item.isTrending && <div className="trending-badge" title="Trending">🔥</div>}
                                                </div>
                                                <div className="badge-group bottom-right">
                                                    {item.isProjected && <div className="projected-badge" title="Projected">⚠️</div>}
                                                    {item.isRare && <div className="rare-badge" title="Rare">💎</div>}
                                                </div>
                                                {itm.is_limited && (
                                                    <div className="limited-badge-overlay">
                                                        <span className="limited-tag">LIMITED</span>
                                                        {wasStock && <span className="limited-u-tag">U</span>}
                                                    </div>
                                                )}
                                                <img src={itm.image_url} alt={itm.name} />
                                            </div>
                                            <div className="inv-card-details">
                                                <div className="inv-card-name">{itm.name}</div>
                                                <div className="inv-card-value">${item.calculatedValue.toLocaleString()}</div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                            <div className="offer-total" style={{ marginTop: '20px' }}>
                                <span>Total: ${calculateTotal(myOffer).toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="offer-section" style={{ background: '#232527', padding: '20px', borderRadius: '8px' }}>
                            <div className="view-section-header">{getTheirLabel()}</div>
                            <div className="view-items-row">
                                {theirOffer.map(item => {
                                    const itm = item.items || {}
                                    const wasStock = itm.sale_type === 'stock'

                                    return (
                                        <Link
                                            to={`/catalog/${itm.id}`}
                                            key={item.id}
                                            className="inv-card"
                                            style={{ width: '120px' }}
                                            onMouseEnter={(e) => handleMouseEnter(e, itm.id)}
                                            onMouseMove={handleMouseMove}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <div className="inv-card-img">
                                                <div className="serial-badge">#{item.serialNumber || '?'}</div>

                                                <div className="badge-group top-right">
                                                    {item.isTrending && <div className="trending-badge" title="Trending">🔥</div>}
                                                </div>

                                                <div className="badge-group bottom-right">
                                                    {item.isProjected && <div className="projected-badge" title="Projected">⚠️</div>}
                                                    {item.isRare && <div className="rare-badge" title="Rare">💎</div>}
                                                </div>

                                                {itm.is_limited && (
                                                    <div className="limited-badge-overlay">
                                                        <span className="limited-tag">LIMITED</span>
                                                        {wasStock && <span className="limited-u-tag">U</span>}
                                                    </div>
                                                )}

                                                <img src={itm.image_url} alt={itm.name} />
                                            </div>
                                            <div className="inv-card-details">
                                                <div className="inv-card-name">{itm.name}</div>
                                                <div className="inv-card-value">${item.calculatedValue.toLocaleString()}</div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                            <div className="offer-total" style={{ marginTop: '20px' }}>
                                <span>Total: ${calculateTotal(theirOffer).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="offers-column">
                    <div className="offer-section" style={{ background: '#232527', padding: '20px', borderRadius: '8px' }}>
                        <h3>Trade Summary</h3>

                        {/* Value Comparison */}
                        {(() => {
                            const myValue = calculateTotal(myOffer)
                            const theirValue = calculateTotal(theirOffer)
                            const diff = theirValue - myValue
                            const diffPercent = myValue > 0 ? (diff / myValue) * 100 : 0

                            // Determine color: green if profit, yellow if similar, red if loss
                            let bgColor
                            if (Math.abs(diffPercent) <= 5) {
                                bgColor = 'rgba(255, 193, 7, 0.15)' // Yellow for fair trade
                            } else if (diff > 0) {
                                bgColor = 'rgba(0, 176, 111, 0.15)' // Green for profit
                            } else {
                                bgColor = 'rgba(255, 107, 107, 0.15)' // Red for loss
                            }

                            return (
                                <div className="value-comparison" style={{ backgroundColor: bgColor }}>
                                    <div className="value-comparison-label">Value Comparison</div>
                                    <div className="value-comparison-values">
                                        <span className="value-send">${myValue.toLocaleString()}</span>
                                        <span className="value-separator">/</span>
                                        <span className="value-receive">${theirValue.toLocaleString()}</span>
                                    </div>
                                    <div className="value-comparison-sublabel">
                                        {status === 'accepted' ? 'You Gave / You Received' : 'You Give / You Receive'}
                                    </div>
                                </div>
                            )
                        })()}

                        <div style={{ marginTop: '20px', fontSize: '20px', fontWeight: 'bold', color: calculateTotal(theirOffer) - calculateTotal(myOffer) >= 0 ? '#00b06f' : '#ff6b6b' }}>
                            {calculateTotal(theirOffer) - calculateTotal(myOffer) > 0 ? '+' : ''}
                            {(calculateTotal(theirOffer) - calculateTotal(myOffer)).toLocaleString()} Value
                        </div>

                        {status === 'pending' && (
                            <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {isReceiver && (
                                    <>
                                        <button className="make-offer-btn" style={{ background: '#00b06f', color: '#fff', fontStyle: 'normal' }} onClick={handleAccept}>Accept Trade</button>
                                        <button className="make-offer-btn" style={{ background: '#ff4d4d', color: '#fff', fontStyle: 'normal' }} onClick={handleDecline}>Decline Trade</button>

                                        {/* Value Request Button - Only for high-value items */}
                                        {(() => {
                                            const hasHighValueItem = theirOffer.some(item => (item.calculatedValue || 0) >= 50000);
                                            if (hasHighValueItem) {
                                                return (
                                                    <button
                                                        className="make-offer-btn"
                                                        style={{ background: '#f59e0b', color: '#fff', fontStyle: 'normal', border: '1px solid #d97706' }}
                                                        onClick={handleValueRequest}
                                                    >
                                                        Request Value Change
                                                    </button>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </>
                                )}
                                {isSender && (
                                    <button className="make-offer-btn" style={{ background: 'transparent', border: '1px solid #fff', color: '#fff', fontStyle: 'normal' }} onClick={handleCancel}>Cancel Trade</button>
                                )}
                            </div>
                        )}

                        {status === 'accepted' && !tradeDetails?.is_proofed && (() => {
                            const myValue = calculateTotal(myOffer);
                            const theirValue = calculateTotal(theirOffer);
                            // Allow proofing if EITHER side is significant (e.g. a big win or a big trade)
                            // User reported issue with 1M+ trade not showing (likely one side was low value)
                            const canProof = myValue >= 10000 || theirValue >= 10000;

                            if (canProof) {
                                return (
                                    <button
                                        className="make-offer-btn"
                                        style={{ background: '#7289da', color: '#fff', fontStyle: 'normal', marginTop: '10px' }}
                                        onClick={handleProof}
                                    >
                                        Proof Trade
                                    </button>
                                );
                            } else {
                                return (
                                    <div style={{ marginTop: '10px', padding: '10px', background: '#333', borderRadius: '4px', fontSize: '12px', color: '#999' }}>
                                        ⓘ Proof requires at least one side to have ≥10k value
                                    </div>
                                );
                            }
                        })()}

                        <button className="cancel-btn-styled" onClick={() => navigate('/trades')}>Back to Trades</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TradeWindow
