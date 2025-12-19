import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import axios from 'axios'
import './Settings.css'

const Settings = () => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('privacy')
  const [showEmail, setShowEmail] = useState(false)

  // Settings State
  const [minTradeValue, setMinTradeValue] = useState(0);
  const [privacySettings, setPrivacySettings] = useState({
    tradeFilter: 'everyone',
    messageFilter: 'everyone',
    inventoryPrivacy: 'everyone'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Fetch current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get('/api/users/me/profile');
        if (res.data) {
          setMinTradeValue(res.data.min_trade_value || 0);
          setPrivacySettings({
            tradeFilter: res.data.trade_privacy || 'everyone',
            messageFilter: res.data.message_privacy || 'everyone',
            inventoryPrivacy: res.data.inventory_privacy || 'everyone'
          });
        }
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handlePrivacyChange = (key, value) => {
    setPrivacySettings(prev => ({ ...prev, [key]: value }))
  }

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await axios.patch('/api/users/me/settings', {
        min_trade_value: parseInt(minTradeValue),
        trade_privacy: privacySettings.tradeFilter,
        inventory_privacy: privacySettings.inventoryPrivacy,
        message_privacy: privacySettings.messageFilter
      });
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

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
        </div>
      </div>
    </div>
  )
}

export default Settings
