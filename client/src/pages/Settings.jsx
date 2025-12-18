import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import axios from 'axios'
import './Settings.css'

import { useVersion } from '../components/UpdateModal';

const Settings = () => {
  const { user } = useAuth()
  const activeVersion = useVersion();
  const [activeTab, setActiveTab] = useState('account')
  // ... (rest of imports)

  // ... inside Layout
  {/* Sidebar */ }
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
    <div style={{ marginTop: 'auto', paddingTop: '20px', color: '#666', fontSize: '13px', textAlign: 'center' }}>
      Version: {activeVersion || 'Loading...'}
    </div>
  </div>

  {/* Content */ }
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
        <h3 className="section-title">Trade Settings</h3>
        <div className="setting-group">
          <label>Minimum Trade Value Request</label>
          <div className="setting-control">
            <input
              type="range"
              min="0"
              max="100000"
              step="1000"
              value={minTradeValue}
              onChange={(e) => setMinTradeValue(e.target.value)}
              className="slider"
            />
            <div className="slider-value-display">
              <input
                type="number"
                value={minTradeValue}
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (val > 100000) val = 100000;
                  if (val < 0) val = 0;
                  setMinTradeValue(val);
                }}
              />
              <span>Value</span>
            </div>
            <p className="setting-description">Users sending you trades must offer at least this much total value.</p>
          </div>
        </div>

        <h3 className="section-title" style={{ marginTop: '30px' }}>Privacy Settings</h3>
        {message && (
          <div className={`settings-message ${message.type}`}>
            {message.text}
          </div>
        )}

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

        <div className="save-btn-container">
          <button
            className="save-btn"
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
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
        </div >
      </div >
    </div >
  )
}

export default Settings
