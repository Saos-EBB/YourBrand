import type { AdminDashboardStatsDto } from './dto/admin-dashboard-stats.dto';

// Plain function ohne DI wie tenant-config.loader.ts: der AdminService ruft sie
// mit seiner DataSource auf, die Mandanten-Console (src/console/) mit einem
// pg-Client pro Mandanten-DB — eine Stelle fuer die Stats-Queries.
export type QueryFn = (sql: string) => Promise<{ value: string }[]>;

const QUERIES: Record<keyof AdminDashboardStatsDto, string> = {
    totalUsers:              `SELECT COUNT(*) AS value FROM users WHERE deleted_at IS NULL`,
    activeUsers:             `SELECT COUNT(*) AS value FROM users WHERE deleted_at IS NULL AND is_banned = false AND is_verified = true`,
    bannedUsers:             `SELECT COUNT(*) AS value FROM users WHERE is_banned = true`,
    newUsersToday:           `SELECT COUNT(*) AS value FROM users WHERE created_at >= DATE_TRUNC('day', NOW())`,
    newUsersThisWeek:        `SELECT COUNT(*) AS value FROM users WHERE created_at >= DATE_TRUNC('week', NOW())`,
    activeSubscriptions:     `SELECT COUNT(*) AS value FROM subscriptions WHERE status = 'active'`,
    totalRevenue:            `SELECT COALESCE(SUM(amount), 0) AS value FROM payment_logs WHERE status = 'success'`,
    onlineUsers:             `SELECT COUNT(*) AS value FROM profiles WHERE last_active_at > NOW() - INTERVAL '15 minutes'`,
    messagesToday:           `SELECT COUNT(*) AS value FROM messages WHERE sent_at >= DATE_TRUNC('day', NOW())`,
    messagesThisWeek:        `SELECT COUNT(*) AS value FROM messages WHERE sent_at >= DATE_TRUNC('week', NOW())`,
    contactRequestsToday:    `SELECT COUNT(*) AS value FROM contact_requests WHERE created_at >= DATE_TRUNC('day', NOW())`,
    contactRequestsThisWeek: `SELECT COUNT(*) AS value FROM contact_requests WHERE created_at >= DATE_TRUNC('week', NOW())`,
    openReports:             `SELECT COUNT(*) AS value FROM reports WHERE status = 'open'`,
    strikesThisWeek:         `SELECT COUNT(*) AS value FROM strikes WHERE created_at >= DATE_TRUNC('week', NOW())`,
    openTickets:             `SELECT COUNT(*) AS value FROM admin_tickets WHERE status = 'open'`,
    pendingMedia:            `SELECT COUNT(*) AS value FROM media_uploads WHERE moderation_status = 'pending'`,
};

export async function collectDashboardStats(query: QueryFn): Promise<AdminDashboardStatsDto> {
    const keys = Object.keys(QUERIES) as (keyof AdminDashboardStatsDto)[];
    const rows = await Promise.all(keys.map((key) => query(QUERIES[key])));
    const stats = {} as AdminDashboardStatsDto;
    // totalRevenue ist eine Summe (numeric), alles andere COUNT(*)
    keys.forEach((key, i) => {
        stats[key] = key === 'totalRevenue' ? parseFloat(rows[i][0].value) : parseInt(rows[i][0].value, 10);
    });
    return stats;
}
