import { useNotifications } from '../contexts/NotificationContext'
import './NotificationContainer.css'

const NotificationContainer = () => {
  const { notifications, markAsRead, popups, removePopup } = useNotifications()

  const unreadNotifications = notifications.filter(n => !n.is_read).slice(0, 5)

  return (
    <>
      <div className="notification-container">
        {unreadNotifications.map(notification => (
          <div
            key={notification.id}
            className={`notification ${notification.type}`}
            onClick={() => markAsRead(notification.id)}
          >
            <div className="notification-content">
              <div className="notification-title">{notification.type.replace('_', ' ').toUpperCase()}</div>
              <div className="notification-message">{notification.message}</div>
            </div>
            <button className="notification-close" onClick={(e) => {
              e.stopPropagation()
              markAsRead(notification.id)
            }}>×</button>
          </div>
        ))}
      </div>
      <div className="popup-container">
        {popups.map(popup => (
          <div
            key={popup.id}
            className={`popup popup-${popup.type}`}
            onClick={() => removePopup(popup.id)}
          >
            <div className="popup-message">{popup.message}</div>
            <button className="popup-close" onClick={(e) => {
              e.stopPropagation()
              removePopup(popup.id)
            }}>×</button>
          </div>
        ))}
      </div>
    </>
  )
}

export default NotificationContainer

