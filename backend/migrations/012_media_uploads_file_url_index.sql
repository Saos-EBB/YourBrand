-- Der Media-Proxy (GET /media/file/*) sucht pro Abruf den Datensatz zur Datei, um den Freigabe-Status zu pruefen
-- (Loadtest-Audit B6). Ohne Index waere das ein Scan ueber media_uploads bei jedem Bild.
CREATE INDEX IF NOT EXISTS idx_media_uploads_file_url ON media_uploads (file_url);
