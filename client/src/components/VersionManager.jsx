import { useState, useEffect } from 'react'
import axios from 'axios'
import './VersionManager.css'

const VersionManager = () => {
    const [currentVersion, setCurrentVersion] = useState(null)
    const [showUpdatePopup, setShowUpdatePopup] = useState(false)

    useEffect(() => {
        // 1. Get initial version on mount
        const fetchInitialVersion = async () => {
            try {
                const res = await axios.get('/api/system/version')
                if (res.data.version) {
                    setCurrentVersion(res.data.version)
                    console.log('App Version:', res.data.version)
                }
            } catch (e) {
                console.error('Failed to fetch version:', e)
            }
        }

        fetchInitialVersion()

        // 2. Poll for updates
        const interval = setInterval(async () => {
            try {
                const res = await axios.get('/api/system/version')
                const latestVersion = res.data.version

                if (currentVersion && latestVersion && currentVersion !== latestVersion) {
                    // Version changed!
                    setShowUpdatePopup(true)
                }
            } catch (e) {
                // Silent fail on poll
            }
        }, 60000) // Check every minute

        return () => clearInterval(interval)
    }, [currentVersion])

    if (!showUpdatePopup) return null

    return (
        <div className="version-popup-overlay">
            <div className="version-popup">
                <div className="version-icon">🚀</div>
                <h3>Update Available!</h3>
                <p>A new version of Roblox Trade Simulator is available.</p>
                <p className="version-details">New Version: {currentVersion} → New</p>
                <button
                    className="refresh-btn"
                    onClick={() => window.location.reload()}
                >
                    Refresh Now
                </button>
            </div>
        </div>
    )
}

export default VersionManager
