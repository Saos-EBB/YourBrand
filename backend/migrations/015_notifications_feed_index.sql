-- GET /notifications: ORDER BY is_read ASC, created_at DESC benötigt einen
-- zusammengesetzten Index. Ohne ihn: Seq Scan über alle Notification-Zeilen (~20 ms
-- bei 71k Zeilen). Mit Index: Bitmap Heap Scan (~0.7 ms). 30× schneller.
CREATE INDEX IF NOT EXISTS idx_notif_user_feed
    ON notifications (user_id, is_read, created_at DESC, id DESC);
