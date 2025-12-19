const express = require('express');
const router = express.Router();
const { getVersion } = require('../utils/version');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const BADGES = require('../config/badges');

router.get('/badges', (req, res) => {
    res.json(BADGES);
});

router.get('/version', (req, res) => {
    try {
        // User requested version check based on most recent commit
        const version = getVersion(); // Returns short commit hash (e.g. 'a1b2c3d')
        res.json({ version });
    } catch (error) {
        console.error('Error getting version:', error);
        res.json({ version: 'unknown' });
    }
});

router.get('/changelogs', (req, res) => {
    try {
        const logPath = path.join(__dirname, '../data/changelogs.json');
        if (fs.existsSync(logPath)) {
            const data = fs.readFileSync(logPath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Error fetching changelogs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

router.post('/accept-tos', authenticate, async (req, res) => {
    try {
        const { error } = await supabase
            .from('users')
            .update({ tos_accepted: true })
            .eq('id', req.user.id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Error accepting ToS:', error);
        res.status(500).json({ error: 'Failed to accept Terms of Service' });
    }
});

module.exports = router;
