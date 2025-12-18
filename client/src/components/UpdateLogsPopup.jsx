import { useState, useEffect } from 'react'
import axios from 'axios'
import './UpdateLogsPopup.css'

const UpdateLogsPopup = () => {
    const [show, setShow] = useState(false)
    const [logs, setLogs] = useState([])
    const [latestVersion, setLatestVersion] = useState(null)

    useEffect(() => {
        const checkUpdates = async () => {
            try {
                // 1. Get current version from backend
                const verRes = await axios.get('/api/system/version')
                const currentVer = verRes.data.version
                setLatestVersion(currentVer)

                // 2. Check local storage
                const seenVer = localStorage.getItem('seen_version')

                // 3. If versions mismatch, fetch detailed logs and show popup
                if (currentVer && currentVer !== seenVer) {
                    const logsRes = await axios.get('/api/system/changelogs')
                    setLogs(logsRes.data)
                    setShow(true)
                }
            } catch (err) {
                console.error('Failed to check updates:', err)
            }
        }

        checkUpdates()
    }, [])

    const handleConfirm = () => {
        if (latestVersion) {
            localStorage.setItem('seen_version', latestVersion)
        }
        setShow(false)
    }

    if (!show) return null

    return (
        <div className="update-logs-overlay">
            <div className="update-logs-popup">
                <div className="update-logs-header">
                    <h2>🚀 Update Log</h2>
                </div>

                <div className="update-logs-content">
                    {logs.map((log, index) => (
                        <article key={index} className="log-article">
                            <div className="log-meta">
                                <span className="log-version">{log.version}</span>
                                <span className="log-date">{log.date}</span>
                            </div>
                            <h3 className="log-title">{log.title}</h3>
                            <div
                                className="log-body"
                                dangerouslySetInnerHTML={{ __html: log.content }}
                            />
                        </article>
                    ))}
                    {logs.length === 0 && (
                        <p>No details available for this update.</p>
                    )}
                </div>

                <div className="update-logs-footer">
                    <button className="confirm-btn" onClick={handleConfirm}>
                        Got it!
                    </button>
                </div>
            </div>
        </div>
    )
}

export default UpdateLogsPopup
