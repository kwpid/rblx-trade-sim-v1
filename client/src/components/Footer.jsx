import React from 'react'
import { Link } from 'react-router-dom'
import './Footer.css'

const Footer = () => {
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
                </p>
            </div>
        </footer>
    )
}

export default Footer
