import { createContext, useState, useContext, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from './AuthContext'

const NotificationContext = createContext()

export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([])
  const [popups, setPopups] = useState([])
  const [inboundCount, setInboundCount] = useState(0) // Shared trade count
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      fetchNotifications()
      fetchInboundTrades() // Initial fetch

      const interval = setInterval(() => {
        fetchNotifications()
        fetchInboundTrades()
      }, 10000) // Poll every 10 seconds (Unified)

      return () => clearInterval(interval)
    }
  }, [user])

  const fetchNotifications = async () => {
    try {
      const response = await axios.get('/api/notifications')
      setNotifications(response.data)
    } catch (error) {
      console.error('Error fetching notifications:', error)
    }
  }

  const fetchInboundTrades = async () => {
    try {
      const response = await axios.get('/api/trades?type=inbound')
      setInboundCount(response.data.length || 0)
    } catch (error) {
      console.error('Error fetching trades:', error)
    }
  }

  const addNotification = (notification) => {
    setNotifications(prev => [notification, ...prev])
  }

  const markAsRead = async (id) => {
    try {
      await axios.put(`/api/notifications/${id}/read`)
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      )
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const showPopup = (message, type = 'info') => {
    const id = Date.now()
    const popup = { id, message, type }
    setPopups(prev => [...prev, popup])

    // Auto remove after 5 seconds
    setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== id))
    }, 5000)

    return id
  }

  const removePopup = (id) => {
    setPopups(prev => prev.filter(p => p.id !== id))
  }

  return (
    <NotificationContext.Provider value={{
      notifications,
      addNotification,
      markAsRead,
      popups,
      showPopup,
      removePopup,
      inboundCount, // Exposed state
      fetchInboundTrades // Exposed updater
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

