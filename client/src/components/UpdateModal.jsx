import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './UpdateModal.css';

const UpdateModal = () => {
    const [update, setUpdate] = useState(null);
    const [version, setVersion] = useState(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const response = await axios.get('/api/meta/version');
                const { version: serverVersion, latest_update } = response.data;

                setVersion(serverVersion);

                if (!latest_update) return;

                const lastSeenVersion = localStorage.getItem('last_seen_version');

                // If new version OR never seen any version
                if (serverVersion !== lastSeenVersion) {
                    setUpdate(latest_update);
                    setShow(true);
                }
            } catch (error) {
                console.error('Failed to check for updates:', error);
            }
        };

        checkUpdate();
    }, []);

    const handleClose = () => {
        if (version) {
            localStorage.setItem('last_seen_version', version);
        }
        setShow(false);
    };

    if (!show || !update) return null;

    return (
        <div className="update-modal-overlay">
            <div className="update-modal">
                <div className="update-modal-header">
                    <span className="update-badge">NEW UPDATE</span>
                    <span className="update-date">{update.date}</span>
                </div>
                <h2 className="update-title">{update.title}</h2>
                <div className="update-content">
                    <ReactMarkdown>{update.content}</ReactMarkdown>
                </div>
                <button className="update-confirm-btn" onClick={handleClose}>
                    Got it!
                </button>
            </div>
        </div>
    );
};

export const useVersion = () => {
    const [ver, setVer] = useState('');
    useEffect(() => {
        axios.get('/api/meta/version').then(res => setVer(res.data.version)).catch(() => { });
    }, []);
    return ver;
};

export default UpdateModal;
