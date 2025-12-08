import { useAuth } from '../contexts/AuthContext'
import './Settings.css'

const Settings = () => {
  const { user } = useAuth()

  return (
    <div className="settings">
      <div className="container">
        <h1>Settings</h1>
        <div className="settings-content">
          <div className="card">
            <h2>Account Settings</h2>
            <div className="settings-item">
              <div className="settings-label">Username</div>
              <div className="settings-value">{user?.username}</div>
            </div>
            <div className="settings-item">
              <div className="settings-label">Email</div>
              <div className="settings-value">{user?.email}</div>
            </div>
            <div className="settings-item">
              <div className="settings-label">Account Type</div>
              <div className="settings-value">
                {user?.is_admin ? 'Admin' : 'Player'}
              </div>
            </div>
          </div>
          <div className="card">
            <h2>About</h2>
            <p>Roblox Trade Simulator v1.0</p>
            <p>Simulate the Roblox marketplace and trading system.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings

