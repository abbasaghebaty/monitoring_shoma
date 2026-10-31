CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner','manager','employee')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  check_in TEXT NOT NULL,
  check_out TEXT,
  duration_minutes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(telegram_id, check_in);
CREATE INDEX IF NOT EXISTS idx_attendance_open ON attendance(telegram_id) WHERE check_out IS NULL;
