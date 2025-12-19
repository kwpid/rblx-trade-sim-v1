const supabase = require('../config/supabase');

/**
 * Database Cleanup Job
 * Runs periodically to clean up old data:
 * - Limits transaction history to 100 per user (deletes oldest)
 * - Deletes inactive trades after 1 hour
 * - Deletes completed trades after 12 hours
 */

const TRANSACTION_LIMIT = 100;
const INACTIVE_TRADE_HOURS = 1;
const COMPLETED_TRADE_HOURS = 12;

async function cleanupTransactions() {
    try {
        console.log('[Cleanup] Starting transaction cleanup...');

        // Get all users
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id');

        if (usersError) throw usersError;

        let totalDeleted = 0;

        // For each user, keep only the latest 100 transactions
        for (const user of users) {
            // Get transaction count for this user
            const { count } = await supabase
                .from('transactions')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            if (count > TRANSACTION_LIMIT) {
                // Get the oldest transactions to delete
                const toDelete = count - TRANSACTION_LIMIT;

                // Get IDs of oldest transactions
                const { data: oldTransactions } = await supabase
                    .from('transactions')
                    .select('id')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: true })
                    .limit(toDelete);

                if (oldTransactions && oldTransactions.length > 0) {
                    const idsToDelete = oldTransactions.map(t => t.id);

                    const { error: deleteError } = await supabase
                        .from('transactions')
                        .delete()
                        .in('id', idsToDelete);

                    if (!deleteError) {
                        totalDeleted += oldTransactions.length;
                    }
                }
            }
        }

        console.log(`[Cleanup] Deleted ${totalDeleted} old transactions`);
    } catch (error) {
        console.error('[Cleanup] Error cleaning up transactions:', error);
    }
}

async function cleanupTrades() {
    try {
        console.log('[Cleanup] Starting trade cleanup...');

        const now = new Date();

        // Delete inactive trades older than 1 hour
        const inactiveThreshold = new Date(now.getTime() - INACTIVE_TRADE_HOURS * 60 * 60 * 1000);
        const { data: deletedInactive, error: inactiveError } = await supabase
            .from('trades')
            .delete()
            .in('status', ['declined', 'cancelled'])
            .lt('updated_at', inactiveThreshold.toISOString())
            .select('id');

        if (inactiveError) {
            console.error('[Cleanup] Error deleting inactive trades:', inactiveError);
        } else {
            console.log(`[Cleanup] Deleted ${deletedInactive?.length || 0} inactive trades`);
        }

        // Delete completed trades older than 12 hours
        const completedThreshold = new Date(now.getTime() - COMPLETED_TRADE_HOURS * 60 * 60 * 1000);
        const { data: deletedCompleted, error: completedError } = await supabase
            .from('trades')
            .delete()
            .eq('status', 'accepted')
            .lt('updated_at', completedThreshold.toISOString())
            .select('id');

        if (completedError) {
            console.error('[Cleanup] Error deleting completed trades:', completedError);
        } else {
            console.log(`[Cleanup] Deleted ${deletedCompleted?.length || 0} completed trades`);
        }
    } catch (error) {
        console.error('[Cleanup] Error cleaning up trades:', error);
    }
}

async function runCleanup() {
    console.log('[Cleanup] Running database cleanup job...');
    await cleanupTransactions();
    await cleanupTrades();
    console.log('[Cleanup] Database cleanup completed');
}

// Run cleanup every 30 minutes
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes

function startCleanupJob() {
    console.log('[Cleanup] Starting database cleanup job (runs every 30 minutes)');

    // Run immediately on startup
    runCleanup();

    // Then run periodically
    setInterval(runCleanup, CLEANUP_INTERVAL);
}

module.exports = {
    startCleanupJob,
    runCleanup
};
