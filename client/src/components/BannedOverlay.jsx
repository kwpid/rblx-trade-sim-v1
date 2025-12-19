import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { formatLocalDate } from '../utils/dateUtils';
import './BannedOverlay.css'; // We'll assume we can add styles here or use inline for now

const BannedOverlay = () => {
    const { user, logout } = useAuth();

    if (!user || !user.isBanned) return null;

    const formatDate = (dateString) => {
        if (!dateString) return 'Never';
        return formatLocalDate(dateString);
    };

    const isPerm = !user.bannedUntil || new Date(user.bannedUntil).getFullYear() > 9000;

    return (
        <div className="banned-overlay">
            <div className="banned-content">
                <div className="banned-icon">🚫</div>
                <h1>Account Banned</h1>
                <p className="banned-reason">
                    <strong>Reason:</strong> {user.banReason || 'Violation of Terms of Service'}
                </p>
                <p className="banned-duration">
                    <strong>Unban Date:</strong> {isPerm ? 'Never (Permanent)' : formatDate(user.bannedUntil)}
                </p>

                <div className="banned-actions">
                    <p className="tos-link">
                        Please review our <a href="/tos" target="_blank" rel="noopener noreferrer">Terms of Service</a>.
                    </p>
                    <button onClick={logout} className="logout-btn">Logout</button>
                </div>
            </div>
        </div>
    );
};

export default BannedOverlay;
