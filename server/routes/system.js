const express = require('express');
const router = express.Router();
const { getVersion } = require('../utils/version');

const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

router.get('/version', (req, res) => {
    res.json({ version: getVersion() });
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
