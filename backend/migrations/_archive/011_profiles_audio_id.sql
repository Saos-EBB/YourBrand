-- 011_profiles_audio_id.sql
-- Verknüpft ein Audio-Upload mit dem Profil: audio_id FK auf media_uploads
-- für die "Hör mich an"-Funktion im Profil.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS audio_id UUID REFERENCES media_uploads(id) ON DELETE SET NULL;
