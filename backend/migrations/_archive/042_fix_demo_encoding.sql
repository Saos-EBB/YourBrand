-- 042_fix_demo_encoding.sql
-- Behebt Encoding-Artefakte in Demo-Seed-Daten die durch CP850/CP437 Windows-Terminal-Encoding
-- beim Ausfuehren der Seed-Scripts entstanden sind: UTF-8-Multibyte-Sequenzen wurden als
-- individuelle CP437-Zeichen (Box-Drawing-Chars, Sonderzeichen) gespeichert.
-- Idempotent: REPLACE() auf nicht vorhandene Muster ist ein No-Op.

-- ── Em-Dash (U+2014 = UTF-8 E2 80 94 → CP437: Ô Ç ö) ──────────────────────
UPDATE messages         SET content         = REPLACE(content,         'ÔÇö', '—') WHERE content         LIKE '%ÔÇö%';
UPDATE contact_requests SET message_preview = REPLACE(message_preview, 'ÔÇö', '—') WHERE message_preview LIKE '%ÔÇö%';
UPDATE beefs            SET chat_passage    = REPLACE(chat_passage,    'ÔÇö', '—') WHERE chat_passage    LIKE '%ÔÇö%';

-- ── Emojis ───────────────────────────────────────────────────────────────────
UPDATE messages SET content = REPLACE(content, '­ƒÆ¬ÔØñ´©Å', '💪❤️') WHERE content LIKE '%­ƒÆ¬%';
UPDATE messages SET content = REPLACE(content, '­ƒÿ¡',        '😭')   WHERE content LIKE '%­ƒÿ¡%';
UPDATE messages SET content = REPLACE(content, '­ƒÖé',        '🙂')   WHERE content LIKE '%­ƒÖé%';
UPDATE messages SET content = REPLACE(content, '­ƒÄ©',        '🎸')   WHERE content LIKE '%­ƒÄ©%';
UPDATE messages SET content = REPLACE(content, '­ƒÿè',        '😊')   WHERE content LIKE '%­ƒÿè%';

UPDATE beefs SET chat_passage = REPLACE(chat_passage, '­ƒÆÇ', '💀') WHERE chat_passage LIKE '%­ƒÆÇ%';
UPDATE beefs SET chat_passage = REPLACE(chat_passage, '­ƒÿè', '😊') WHERE chat_passage LIKE '%­ƒÿè%';

UPDATE contact_requests SET message_preview = REPLACE(message_preview, '­ƒÿè', '😊') WHERE message_preview LIKE '%­ƒÿè%';
UPDATE contact_requests SET message_preview = REPLACE(message_preview, '­ƒÿ', '😊') WHERE message_preview LIKE '%­ƒÿ%';

-- ── Deutsche Umlaute (UTF-8 C3 xx → CP437: ├ + Folgezeichen) ────────────────
--   ├╝ = ü  (C3 BC)
--   ├ñ = ä  (C3 A4)
--   ├Â = ö  (C3 B6 in CP850)
UPDATE profiles SET bio =
  REPLACE(REPLACE(REPLACE(bio, '├╝', 'ü'), '├ñ', 'ä'), '├Â', 'ö')
  WHERE bio ~ '├';

UPDATE contact_requests SET message_preview =
  REPLACE(REPLACE(REPLACE(message_preview, '├╝', 'ü'), '├ñ', 'ä'), '├Â', 'ö')
  WHERE message_preview ~ '├';

UPDATE beefs SET chat_passage =
  REPLACE(REPLACE(REPLACE(chat_passage, '├╝', 'ü'), '├ñ', 'ä'), '├Â', 'ö')
  WHERE chat_passage ~ '├';

UPDATE messages SET content =
  REPLACE(REPLACE(REPLACE(content, '├╝', 'ü'), '├ñ', 'ä'), '├Â', 'ö')
  WHERE content ~ '├';
