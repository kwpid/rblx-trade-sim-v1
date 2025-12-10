import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './Settings.css'

const Settings = () => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('account')
  const [showEmail, setShowEmail] = useState(false)

  // Privacy settings state (placeholders for now)
  const [privacySettings, setPrivacySettings] = useState({
    tradeFilter: 'everyone',
    messageFilter: 'everyone',
    inventoryPrivacy: 'everyone'
  })

  const handlePrivacyChange = (key, value) => {
    setPrivacySettings(prev => ({ ...prev, [key]: value }))
    // In real app, would save to backend here
  }

  const maskEmail = (email) => {
    if (!email) return 'No email'
    const parts = email.split('@')
    if (parts.length < 2) return email
    const username = parts[0]
    const domain = parts[1]

    const maskedUsername = username.length > 2
      ? `${username.substring(0, 2)}***`
      : `${username}***`

    return `${maskedUsername}@${domain}`
  }

  return (
    <div className="settings-page">
      <div className="container">
        <div className="settings-layout">
          {/* Sidebar */}
          <div className="settings-sidebar">
            <h2>Settings</h2>
            <nav className="settings-nav">
              <button
                className={`settings-tab ${activeTab === 'account' ? 'active' : ''}`}
                onClick={() => setActiveTab('account')}
              >
                Account Info
              </button>
              <button
                className={`settings-tab ${activeTab === 'privacy' ? 'active' : ''}`}
                onClick={() => setActiveTab('privacy')}
              >
                Privacy
              </button>
              <button
                className={`settings-tab ${activeTab === 'security' ? 'active' : ''}`}
                onClick={() => setActiveTab('security')}
              >
                Security
              </button>
              <button
                className={`settings-tab ${activeTab === 'billing' ? 'active' : ''}`}
                onClick={() => setActiveTab('billing')}
              >
                Billing
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="settings-content">
            {activeTab === 'account' && (
              <div className="settings-section">
                <h3 className="section-title">Account Info</h3>
                <div className="setting-group">
                  <label>Display Name</label>
                  <div className="setting-control disabled">
                    <input type="text" value={user?.username || ''} disabled />
                    <span className="setting-note">Username changes are not available yet.</span>
                  </div>
                </div>
                <div className="setting-group">
                  <label>Email Address</label>
                  <div className="setting-control">
                    <div className="email-display">
                      <input
                        type="text"
                        value={showEmail ? (user?.email || '') : maskEmail(user?.email)}
                        disabled
                      />
                      <button
                        className="visibility-toggle"
                        onClick={() => setShowEmail(!showEmail)}
                      >
                        {showEmail ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="setting-group">
                  <label>Account Type</label>
                  <div className="fake-input">
                    {user?.is_admin ? 'Administrator' : 'Standard User'}
                  </div>
                </div>
                <div className="setting-group">
                  <label>Personal Blurb</label>
                  <textarea placeholder="Write something about yourself..." rows="3"></textarea>
                  <div className="save-btn-container">
                    <button className="save-btn">Save</button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="settings-section">
                <h3 className="section-title">Privacy Settings</h3>
                <div className="setting-group">
                  <label>Who can message me?</label>
                  <select
                    value={privacySettings.messageFilter}
                    onChange={(e) => handlePrivacyChange('messageFilter', e.target.value)}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="friends">Friends Only</option>
                    <option value="none">No One</option>
                  </select>
                </div>
                <div className="setting-group">
                  <label>Who can trade with me?</label>
                  <select
                    value={privacySettings.tradeFilter}
                    onChange={(e) => handlePrivacyChange('tradeFilter', e.target.value)}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="friends">Friends Only</option>
                    <option value="none">No One</option>
                  </select>
                </div>
                <div className="setting-group">
                  <label>Who can see my inventory?</label>
                  <select
                    value={privacySettings.inventoryPrivacy}
                    onChange={(e) => handlePrivacyChange('inventoryPrivacy', e.target.value)}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="friends">Friends Only</option>
                    <option value="none">No One</option>
                  </select>
                </div>
              </div>
            )}

            {/* Placeholders for other tabs */}
            {(activeTab === 'security' || activeTab === 'billing') && (
              <div className="settings-section">
                <h3 className="section-title">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
                <p className="placeholder-text">This section is coming soon.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
