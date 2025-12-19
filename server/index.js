require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Track online users for authenticated requests
app.use((req, res, next) => {
  // This will be handled by the users route middleware
  next();
});

// Initialize jobs
const { startAiService } = require('./services/aiService');
const { startPaycheckJob } = require('./jobs/paycheck');
const { startPlayerSnapshotJob } = require('./jobs/playerSnapshots');
const { startCleanupJob } = require('./jobs/cleanup');

// Start background jobs
startAiService();
startPaycheckJob();
startPlayerSnapshotJob();
startCleanupJob(); // Start database cleanup job

// Routes
const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const marketplaceRoutes = require('./routes/marketplace');
const eventRoutes = require('./routes/event');
const userRoutes = require('./routes/users');
const tradeRoutes = require('./routes/trades');
const systemRoutes = require('./routes/system');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const transactionRoutes = require('./routes/transactions');

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/event', eventRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/transactions', transactionRoutes);

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
