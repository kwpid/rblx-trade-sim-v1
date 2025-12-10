import { useState, useEffect } from 'react'
import axios from 'axios'
import './Transactions.css'

const Transactions = () => {
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    useEffect(() => {
        fetchTransactions()
    }, [page])

    const fetchTransactions = async () => {
        setLoading(true)
        try {
            const response = await axios.get(`/api/transactions?page=${page}&limit=10`)
            // Handle both old array format (fallback) and new paginated format
            if (Array.isArray(response.data)) {
                setTransactions(response.data)
                setTotalPages(1)
            } else {
                setTransactions(response.data.data)
                setTotalPages(response.data.meta.totalPages)
            }
        } catch (error) {
            console.error('Error fetching transactions:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleNext = () => {
        if (page < totalPages) setPage(p => p + 1)
    }

    const handlePrev = () => {
        if (page > 1) setPage(p => p - 1)
    }

    return (
        <div className="transactions-container">
            <div className="transactions-header">
                <h1>My Transactions</h1>
            </div>

            <div className="transactions-list">
                {loading ? (
                    <div className="loading">Loading...</div>
                ) : transactions.length === 0 ? (
                    <div className="no-transactions">No transactions found.</div>
                ) : (
                    transactions.map(tx => (
                        <div key={tx.id} className="transaction-card">
                            <div className="tx-left">
                                <div className="tx-image">
                                    {tx.items ? (
                                        <img src={tx.items.image_url} alt={tx.items.name} />
                                    ) : (
                                        <div className="tx-placeholder">?</div>
                                    )}
                                </div>
                                <div className="tx-details">
                                    <div className="tx-title">
                                        {tx.type === 'buy' ? 'Purchased' : 'Sold'} {tx.items?.name || 'Item'}
                                    </div>
                                    <div className="tx-sub">
                                        {tx.related_user ? (
                                            <>from <span className="tx-user">{tx.related_user.username}</span></>
                                        ) : (
                                            tx.type === 'buy' && !tx.related_user_id ? 'from Shop' : ''
                                        )}
                                        <span className="tx-date"> • {new Date(tx.created_at).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            <div className={`tx-amount ${tx.type}`}>
                                {tx.type === 'buy' ? '-' : '+'}R${tx.amount.toLocaleString()}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {totalPages > 1 && (
                <div className="pagination-controls">
                    <button onClick={handlePrev} disabled={page === 1}>Previous</button>
                    <span>Page {page} of {totalPages}</span>
                    <button onClick={handleNext} disabled={page === totalPages}>Next</button>
                </div>
            )}
        </div>
    )
}

export default Transactions
