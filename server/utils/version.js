const { execSync } = require('child_process');

let version = null;

const getVersion = () => {
    if (version) return version;

    // 1. Try Render Environment Variable
    if (process.env.RENDER_GIT_COMMIT) {
        version = process.env.RENDER_GIT_COMMIT.substring(0, 7);
        return version;
    }

    // 2. Try git command
    try {
        version = execSync('git rev-parse --short HEAD').toString().trim();
    } catch (e) {
        console.warn('Failed to get git version:', e.message);
        version = 'unknown-' + Date.now();
    }

    return version;
};

module.exports = { getVersion };
