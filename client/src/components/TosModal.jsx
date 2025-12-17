import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './TosModal.css';

const TosModal = () => {
    const { user, refreshUser } = useAuth();
    const [loading, setLoading] = useState(false);

    // If user is not logged in or already accepted ToS, don't show
    if (!user || user.tos_accepted || user.isBanned) return null;

    const handleAccept = async () => {
        setLoading(true);
        try {
            await axios.post('/api/system/accept-tos');
            await refreshUser(); // Refresh user to update tos_accepted state
        } catch (error) {
            console.error('Failed to accept ToS:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tos-modal-overlay">
            <div className="tos-modal">
                <h2>Terms of Service Update</h2>
                <div className="tos-modal-body">
                    <p>Please review and accept our Rules and Terms of Service to continue playing.</p>
                    <ul className="tos-summary-list">
                        <li>No glitch abusing or exploits.</li>
                        <li>No scamming or harassment.</li>
                        <li>All items are virtual and have no monetary value.</li>
                        <li>Admins have final say in moderation disputes.</li>
                    </ul>
                    <p><a href="/tos" target="_blank" rel="noopener noreferrer">Read full Terms of Service</a></p>
                </div>
                <div className="tos-modal-actions">
                    <button onClick={handleAccept} disabled={loading} className="accept-btn">
                        {loading ? 'Processing...' : 'I Agree & Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TosModal;
