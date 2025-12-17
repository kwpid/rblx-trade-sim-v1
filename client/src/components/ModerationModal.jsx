import React, { useState } from 'react';
import axios from 'axios';
import './ModerationModal.css';

const MODERATION_REASONS = [
    'Glitch Abusing',
    'Glitch Abusing w/ Intent of Economic Disruption',
    'Scamming',
    'Exploiting',
    'Harassment',
    'Inappropriate Content',
    'Other'
];

const BAN_DURATIONS = [
    { label: '1 Hour', value: '1' },
    { label: '6 Hours', value: '6' },
    { label: '12 Hours', value: '12' },
    { label: '1 Day', value: '24' },
    { label: '3 Days', value: '72' },
    { label: '7 Days', value: '168' },
    { label: '30 Days', value: '720' },
    { label: 'Permanent', value: 'perm' }
];

const ModerationModal = ({ userId, username, onClose, onSuccess }) => {
    const [activeTab, setActiveTab] = useState('warn'); // warn, ban, wipe
    const [reason, setReason] = useState(MODERATION_REASONS[0]);
    const [customReason, setCustomReason] = useState('');
    const [duration, setDuration] = useState(BAN_DURATIONS[0].value);
    const [wipeInventory, setWipeInventory] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const finalReason = reason === 'Other' ? customReason : reason;

            const payload = {
                userId,
                action: activeTab,
                reason: finalReason,
                duration: activeTab === 'ban' ? duration : null,
                wipe: activeTab === 'ban' && wipeInventory
            };

            await axios.post('/api/admin/moderate', payload);

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Failed to submit moderation action');
        } finally {
            setLoading(false);
        }
    };

    const isLongBan = duration === '720' || duration === 'perm';

    return (
        <div className="modal-overlay">
            <div className="moderation-modal">
                <div className="modal-header">
                    <h2>Moderate: {username}</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'warn' ? 'active' : ''}`}
                        onClick={() => setActiveTab('warn')}
                    >
                        Warn
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'ban' ? 'active' : ''}`}
                        onClick={() => setActiveTab('ban')}
                    >
                        Ban
                    </button>
                    {/* Wipe is separate logic usually coupled with ban, but user asked for "warn, ban, wipe" options. 
              Implementing standalone Wipe is risky but if requested... 
              Actually user said "have a wipe option (optional only available if the ban is 30 days or longer)"
              So Wipe is a sub-option of Ban. But list said "Admins can: warn, ban, wipe users".
              I will stick to Wipe as an OPTION inside Ban or a specific extreme action.
              For safety, I'll keep it as a checkbox in Ban as requested "available if ban is 30 days+".
          */}
                </div>

                <form onSubmit={handleSubmit} className="modal-content">
                    <div className="form-group">
                        <label>Reason</label>
                        <select value={reason} onChange={(e) => setReason(e.target.value)}>
                            {MODERATION_REASONS.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    {reason === 'Other' && (
                        <div className="form-group">
                            <label>Specific Reason</label>
                            <textarea
                                value={customReason}
                                onChange={(e) => setCustomReason(e.target.value)}
                                placeholder="Enter details..."
                                required
                            />
                        </div>
                    )}

                    {activeTab === 'ban' && (
                        <>
                            <div className="form-group">
                                <label>Duration</label>
                                <select value={duration} onChange={(e) => {
                                    setDuration(e.target.value);
                                    // Reset wipe if not long ban
                                    if (e.target.value !== '720' && e.target.value !== 'perm') {
                                        setWipeInventory(false);
                                    }
                                }}>
                                    {BAN_DURATIONS.map(d => (
                                        <option key={d.value} value={d.value}>{d.label}</option>
                                    ))}
                                </select>
                            </div>

                            {isLongBan && (
                                <div className="form-group checkbox-group">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={wipeInventory}
                                            onChange={(e) => setWipeInventory(e.target.checked)}
                                        />
                                        Wipe Inventory (Transfer to Admin)
                                    </label>
                                    <p className="help-text warning">This will transfer ALL items from this user to the Admin account. This cannot be easily undone.</p>
                                </div>
                            )}
                        </>
                    )}

                    {error && <div className="error-message">{error}</div>}

                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="cancel-btn">Cancel</button>
                        <button type="submit" className={`submit-btn ${activeTab}`} disabled={loading}>
                            {loading ? 'Processing...' : `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} User`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ModerationModal;
