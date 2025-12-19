import { useState, useEffect } from 'react'
import axios from 'axios'
import { Link, useLocation } from 'react-router-dom'
import './Footer.css'

const Footer = () => {
    const [version, setVersion] = useState('')
    const location = useLocation()

    // Hide footer on Trade Window to maximize space
    // Check if path starts with /trades/ but is not just the list /trades
    const isTradeWindow = location.pathname.match(/^\/trades\/.+/)

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const res = await axios.get('/api/system/version')
                if (res.data.version) {
                    setVersion(res.data.version)
                }
            } catch (e) {
                console.error('Failed to fetch version', e)
            }
        }
        fetchVersion()
    }, [])

    if (isTradeWindow) return null

    return (
        <footer className="site-footer">
            <div className="container footer-content">
                <div className="footer-links">
                    <Link to="/tos" className="footer-link">Terms of Service</Link>
                    <span className="separator">|</span>
                    <Link to="/tos" className="footer-link">Privacy Policy</Link>
                    <span className="separator">|</span>
                    <Link to="/value-changes" className="footer-link">Value Changes</Link>
                </div>
                <p className="copyright">
                    &copy; {new Date().getFullYear()} Roblox Trade Simulator. Not affiliated with Roblox Corporation.
                    {version && <span className="footer-version"> v{version}</span>}
                </p>
            </div>
        </footer>
    )
}

export default Footer
