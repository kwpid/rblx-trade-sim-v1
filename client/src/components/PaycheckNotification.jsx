import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import axios from 'axios'
import './PaycheckNotification.css'

const PaycheckNotification = () => {
  const { user } = useAuth()
  const [timeLeft, setTimeLeft] = useState(60)
  const [cash, setCash] = useState(user?.cash || 0)

  useEffect(() => {
    if (!user) return

    // Fetch initial cash
    const fetchCash = async () => {
      try {
        const response = await axios.get('/api/users/me/profile')
        setCash(response.data.cash)
      } catch (error) {
        console.error('Error fetching cash:', error)
      }
    }

    fetchCash()

    // Update timer every second
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          fetchCash() // Refresh cash when paycheck arrives
          return 60
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [user])

  if (!user) return null

  const progress = ((60 - timeLeft) / 60) * 100

  return (
    <div className="paycheck-notification">
      <div className="paycheck-content">
        <div className="paycheck-header">
          <span className="paycheck-label">Next Paycheck</span>
          <span className="paycheck-time">{timeLeft}s</span>
        </div>
        <div className="paycheck-progress-bar">
          <div 
            className="paycheck-progress-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export default PaycheckNotification

