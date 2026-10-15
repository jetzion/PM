# Database schema

SQLite at `/data/app.db` on Docker volume `pm-data` (override with `PM_DB_PATH`). Schema version is tracked in `PRAGMA user_version` (currently `7`). AI chat history is never stored.

## Tables

```sql
users    (id INTEGER PK, username TEXT UNIQUE COLLATE NOCASE, password_hash TEXT, created_at TEXT)
sessions (token TEXT PK, user_id -> users ON DELETE CASCADE, created_at TEXT)
board_members (board_id -> boards ON DELETE CASCADE, user_id -> users ON DELETE CASCADE,
          created_at TEXT, PRIMARY KEY (board_id, user_id))
boards   (id INTEGER PK, user_id -> users ON DELETE CASCADE, name TEXT,
          done_column_id TEXT NULL, created_at TEXT)
columns  (board_id -> boards ON DELETE CASCADE, id TEXT, title TEXT, position INTEGER,
          PRIMARY KEY (board_id, id))
cards    (board_id, id TEXT, column_id TEXT, title TEXT, details TEXT,
          priority TEXT DEFAULT 'medium', due_date TEXT NULL, position INTEGER,
          PRIMARY KEY (board_id, id),
          FOREIGN KEY (board_id, column_id) -> columns ON DELETE CASCADE)
checklist_items (board_id, id TEXT, card_id TEXT, text TEXT, done INTEGER, position INTEGER,
          PRIMARY KEY (board_id, id),
          FOREIGN KEY (board_id, card_id) -> cards ON DELETE CASCADE)
comments (board_id -> boards ON DELETE CASCADE, id TEXT, card_id TEXT, user_id -> users,
          body TEXT, created_at TEXT ISO UTC, PRIMARY KEY (board_id, id))
labels   (board_id -> boards ON DELETE CASCADE, id TEXT, name TEXT, color TEXT,
          PRIMARY KEY (board_id, id))
card_labels (board_id, card_id, label_id, PRIMARY KEY (board_id, card_id, label_id),
          FOREIGN KEY (board_id, card_id) -> cards ON DELETE CASCADE,
          FOREIGN KEY (board_id, label_id) -> labels ON DELETE CASCADE)
```

The full DDL is `SCHEMA` in `backend/database.py`.

Notes:
- Column and card ids are text and unique per board, not globally. Every board can reuse the demo ids (`col-backlog`, `card-1`), which keeps AI replacement boards and e2e fixtures simple. Every query on `columns`/`cards` must filter by `board_id`.
- `position` is zero-based within a board (columns) or within a column (cards), and is rewritten to stay contiguous after deletes and moves.
- Passwords are scrypt hashes, `scrypt$<salt hex>$<digest hex>` (`backend/auth.py`).
- Sessions are opaque random tokens sent as the `pm_session` httpOnly cookie (30-day `Max-Age`). Sessions older than 30 days are rejected and pruned on the next sign-in. Logout deletes the row; changing a password deletes the user's other sessions.
- `boards.user_id` is the owner; `board_members` lists other users with access (never the owner). `ACCESSIBLE_BOARDS` in `database.py` is the shared SQL condition for "owner or member".
- `boards.done_column_id` names the column whose cards count as completed (never overdue). It is not a foreign key; the delete-column route nulls it, and full replacements set it from `doneColumnId`.
- Comments are deliberately not a foreign key to `cards`: `replace_board` deletes and re-inserts every card, which would cascade them away. `prune_comments(conn, board_id)` removes comments whose card no longer exists; call it anywhere cards can disappear. Cards report a read-only `commentCount`.
- Labels are ordered by insertion (`rowid`). Colors: yellow, blue, purple, navy, gray. A card's `labelIds` come back in board label order.
- Deleting a user cascades to sessions, boards, columns, cards, and labels. Deleting a board cascades to its columns, cards, and labels; deleting a card or a label removes its `card_labels` rows.

## Startup

`init_database()` runs in one transaction:

1. If the legacy single-board schema is present (`columns.user_id` exists), migrate it: rename the old tables to `legacy_*`, create the new schema, hash each plain-text password, create one "Kanban Studio" board per user holding their old columns and cards, then drop the `legacy_*` tables.
2. Create any missing tables and indexes (v3 added `labels` and `card_labels`, v5 added `checklist_items`, v6 added `comments`, v7 added `board_members`, this way). If `cards` lacks `priority` (a v1 database), add `priority` and `due_date` with `ALTER TABLE`. If `boards` lacks `done_column_id` (v3), add it and backfill once from a column titled "Done" (case-insensitive); the legacy migration runs the same backfill. Set `user_version`.
3. If there are no users, create the demo user `user` / `password`.

## Seed data

Every new user (the demo user and anyone who registers) gets one board named "Kanban Studio" containing `DEMO_BOARD` (including labels Research, Design, Launch) from `backend/database.py` (mirrored by `initialData` in `frontend/src/lib/kanban.ts`): columns Backlog, Discovery, In Progress, Review, Done and cards `card-1` to `card-8`.

Boards created later with `POST /api/boards` start with empty "To Do", "In Progress", and "Done" columns.

## Board shape and validation

All board reads and writes use `BoardData` (`{ columns: {id, title, cardIds}[], cards: Record<id, {id, title, details, priority, dueDate, labelIds, checklist: {id, text, done}[]}>, labels: {id, name, color}[], doneColumnId: string | null }`). A full replacement (`PUT /api/boards/{id}` or an AI update) is validated first, then the board's columns and labels are deleted (cards and card labels cascade) and re-inserted in order inside the caller's transaction.

Validation: unique column ids; non-empty column and card titles; every `cardId` exists in `cards`; every card appears in exactly one column; card record keys match their ids; `doneColumnId` is null or one of the board's columns; priority is `low`, `medium`, or `high`; `dueDate` is null or a real `YYYY-MM-DD` date; label ids unique with non-empty names and a valid color; a card's `labelIds` are unique and reference board labels; checklist item ids are unique across the board and item text is non-empty.
