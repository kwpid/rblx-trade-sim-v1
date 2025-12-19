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

  // Sound Setup (Embedded Base64 for reliability)
  // Short pleasant 'ding' sound
  const NOTIFICATION_SOUND = 'data:audio/mp3;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAG84AAD555 GAP555MA5556A5556AAAAAAAAD555AAP555MA5556A5556AAAAAAAAAAAAA///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////';
  const [initTime] = useState(Date.now());
  const [hasInitialized, setHasInitialized] = useState(false);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get('/api/notifications')
      const latest = response.data

      setNotifications(prev => {
        // If first load, just set state and mark initialized
        if (!hasInitialized) {
          setHasInitialized(true);
          return latest;
        }

        const prevIds = new Set(prev.map(n => n.id))
        const newNotifs = latest.filter(n => !prevIds.has(n.id))

        if (newNotifs.length > 0) {
          // Check for RECENT item_release (created after component mount)
          // This prevents old notifications from triggering sound on re-fetches or race conditions
          const recentItemReleases = newNotifs.filter(n =>
            n.type === 'item_release' &&
            new Date(n.created_at).getTime() > initTime
          );

          if (recentItemReleases.length > 0) {
            // Play Sound
            try {
              const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-positive-notification-951.mp3'); // Keeping URL as primary, logic was likely the issue
              audio.volume = 0.5;
              const playPromise = audio.play();

              if (playPromise !== undefined) {
                playPromise.catch(error => {
                  console.log('Auto-play prevented:', error);
                });
              }

              // Also show popup if not already shown
              recentItemReleases.forEach(n => {
                showPopup(n.message, 'success');
              });
            } catch (e) {
              console.error("Sound Error", e);
            }
          }
        }
        return latest
      })
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

