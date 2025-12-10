const express = require('express');
const router = express.Router();
const { getVersion } = require('../utils/version');

router.get('/version', (req, res) => {
    res.json({ version: getVersion() });
});

module.exports = router;
