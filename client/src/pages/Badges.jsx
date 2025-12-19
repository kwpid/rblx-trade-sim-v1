import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './Badges.css';

const Badges = () => {
    const { user } = useAuth();
    const [badges, setBadges] = useState([]);
    const [earnedMap, setEarnedMap] = useState(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch badge definitions
                const { data: allBadges } = await axios.get('/api/system/badges');
                setBadges(allBadges);

                // Fetch user badges
                if (user) {
                    // We can check user.badges from context if updated, but let's fetch profile to be sure
                    const { data: profile } = await axios.get('/api/users/me/profile');
                    if (profile && profile.badges) {
                        setEarnedMap(new Set(profile.badges.map(b => b.id)));
                    }
                }
            } catch (error) {
                console.error('Error fetching badges data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    if (loading) {
        return <div className="loading"><div className="spinner"></div></div>;
    }

    // Group badges by type for better display order if needed, but simple grid is fine.
    // Let's sort earned first?
    const sortedBadges = [...badges].sort((a, b) => {
        const aEarned = earnedMap.has(a.id);
        const bEarned = earnedMap.has(b.id);
        if (aEarned && !bEarned) return -1;
        if (!aEarned && bEarned) return 1;
        // Then by implicit order in array (config)
        return 0;
    });

    return (
        <div className="badges-page">
            <div className="badges-container">
                <div className="badges-header">
                    <h1>Badges</h1>
                    <p>Collect rare items and build your wealth to earn permanent badges.</p>
                    <button
                        onClick={async () => {
                            setLoading(true);
                            try {
                                await axios.post('/api/users/me/badges/scan');
                                // Refetch profile to update state
                                const { data: profile } = await axios.get('/api/users/me/profile');
                                if (profile && profile.badges) {
                                    setEarnedMap(new Set(profile.badges.map(b => b.id)));
                                }
                            } catch (e) {
                                console.error(e);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="scan-btn"
                        style={{
                            marginTop: '1rem',
                            padding: '10px 20px',
                            background: '#00a2ff',
                            border: 'none',
                            borderRadius: '5px',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        🔄 Check for New Badges
                    </button>
                </div>

                <div className="badges-grid">
                    {sortedBadges.map(badge => {
                        const isEarned = earnedMap.has(badge.id);
                        return (
                            <div key={badge.id} className={`badge-card ${isEarned ? 'earned' : 'locked'}`}>
                                <div className="badge-icon">{badge.icon}</div>
                                <div className="badge-info">
                                    <h3>{badge.name}</h3>
                                    <p>{badge.description}</p>
                                </div>
                                {isEarned ? (
                                    <div className="earned-status">Earned</div>
                                ) : (
                                    <div className="locked-status">Locked</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default Badges;
