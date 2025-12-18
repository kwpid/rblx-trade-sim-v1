const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let cachedVersion = null;

const getVersion = () => {
    if (cachedVersion) return cachedVersion;
    try {
        // Try to get git tag
        const tag = execSync('git describe --tags --abbrev=0').toString().trim();
        cachedVersion = tag;
        return tag;
    } catch (e) {
        // Fallback if no git or no tags
        console.warn('Could not get git version:', e.message);
        return 'v1.X.X';
    }
};

router.get('/version', (req, res) => {
    try {
        const version = getVersion();
        const updatesPath = path.join(__dirname, '../data/updates.json');

        let updates = [];
        if (fs.existsSync(updatesPath)) {
            const data = fs.readFileSync(updatesPath, 'utf8');
            updates = JSON.parse(data);
        }

        res.json({
            version,
            latest_update: updates.length > 0 ? updates[0] : null
        });
    } catch (error) {
        console.error('Error fetching version:', error);
        res.status(500).json({ error: 'Failed to fetch version' });
    }
});

module.exports = router;
