-- 041_fix_interest_encoding.sql
-- Korrigiert Interessen-Namen die mit falscher Client-Encoding gespeichert wurden.
-- Durch einen CP850-Encoding-Fehler beim Ausführen der Seed/Migrations wurden
-- UTF-8 Bytes als individuelle Zeichen (Box-Drawing-Chars etc.) gespeichert.
-- Sicher mehrfach ausführbar (idempotent durch != Bedingung).

UPDATE interests SET name_de = 'Bücher'
  WHERE name_de LIKE 'B%cher' AND name_de != 'Bücher';

UPDATE interests SET name_de = 'Bogenschießen'
  WHERE name_de LIKE 'Bogenschie%en' AND name_de != 'Bogenschießen';

UPDATE interests SET name_de = 'Bürokratie'
  WHERE name_de LIKE 'B%rokratie' AND name_de != 'Bürokratie';

UPDATE interests SET name_de = 'Fußball'
  WHERE name_de LIKE 'Fu%ball' AND name_de != 'Fußball';

UPDATE interests SET name_de = 'Kältebad'
  WHERE name_de LIKE 'K%ltebad' AND name_de != 'Kältebad';

UPDATE interests SET name_de = 'Lärm'
  WHERE name_de LIKE 'L%rm' AND name_de != 'Lärm';

UPDATE interests SET name_de = 'Negativität'
  WHERE name_de LIKE 'Negativit%t' AND name_de != 'Negativität';

UPDATE interests SET name_de = 'Oberflächlichkeit'
  WHERE name_de LIKE 'Oberfl%chlichkeit' AND name_de != 'Oberflächlichkeit';

UPDATE interests SET name_de = 'Überheblichkeit'
  WHERE name_de LIKE '%berheblichkeit' AND name_de != 'Überheblichkeit';

UPDATE interests SET name_de = 'Ungeduld'
  WHERE name_de LIKE 'Ungeduld%' AND name_de != 'Ungeduld';

UPDATE interests SET name_de = 'Unordnung'
  WHERE name_de LIKE 'Unordnung%' AND name_de != 'Unordnung';

UPDATE interests SET name_de = 'Unzuverlässigkeit'
  WHERE name_de LIKE 'Unzuverl%ssigkeit' AND name_de != 'Unzuverlässigkeit';

UPDATE interests SET name_de = 'Zu spät kommen'
  WHERE name_de LIKE 'Zu sp%t kommen' AND name_de != 'Zu spät kommen';
