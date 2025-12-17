const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

// Track online users (in-memory, could be Redis in production)
const onlineUsers = new Map();

// Update user's online status
const updateOnlineStatus = (userId) => {
  if (!userId) return;
  onlineUsers.set(userId, Date.now());
  // Consider user offline if they haven't been active in 5 minutes
  setTimeout(() => {
    const lastSeen = onlineUsers.get(userId);
    if (lastSeen && Date.now() - lastSeen > 5 * 60 * 1000) {
      onlineUsers.delete(userId);
    }
  }, 5 * 60 * 1000);
};

// Export function to get online users
const getOnlineUsers = () => {
  // Clean up old entries
  const now = Date.now();
  for (const [userId, lastSeen] of onlineUsers.entries()) {
    if (now - lastSeen > 5 * 60 * 1000) {
      onlineUsers.delete(userId);
    }
  }
  return Array.from(onlineUsers.keys());
};

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    const { data: user } = await supabase
      .from('users')
      .select('id, username, email, cash, is_admin, banned_until, tos_accepted')
      .eq('id', decoded.userId)
      .single();

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user is banned
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      // Fetch the latest active ban log for the reason
      const { data: banLog } = await supabase
        .from('moderation_logs')
        .select('reason')
        .eq('user_id', user.id)
        .eq('action', 'ban')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const reason = banLog ? banLog.reason : 'Violation of Terms of Service';

      return res.status(403).json({
        error: 'Account Banned',
        banned_until: user.banned_until,
        reason: reason
      });
    }

    // Update online status
    updateOnlineStatus(user.id);

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, getOnlineUsers };

