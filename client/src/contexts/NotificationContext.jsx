import { createContext, useState, useContext } from 'react'

const NotificationContext = createContext()

export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}

export const NotificationProvider = ({ children }) => {
  const [popups, setPopups] = useState([])
  const [inboundCount, setInboundCount] = useState(0) // Shared trade count

  // Dummy functions to prevent errors - no actual polling
  const fetchNotifications = () => {}
  const fetchInboundTrades = () => {}

  const showPopup = (message, type = 'info') => {
    const id = Date.now()
    setPopups(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== id))
    }, 5000) // Auto-remove after 5 seconds
  }

  const removePopup = (id) => {
    setPopups(prev => prev.filter(p => p.id !== id))
  }

  const markAsRead = () => {} // Dummy function

  return (
    <NotificationContext.Provider value={{
      notifications: [], // Empty array
      popups,
      inboundCount,
      showPopup,
      removePopup,
      markAsRead,
      fetchNotifications,
      fetchInboundTrades
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

