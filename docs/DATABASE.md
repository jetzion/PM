# Database schema

Approved in Part 5 and implemented in Part 6.

## Decisions

- Database: SQLite.
- File path in the container: `/data/app.db`.
- Docker volume: `pm-data`, mounted at `/data`, so the database survives container restarts.
- Create the database and tables on backend startup if they do not exist.
- Use normalized tables: `users`, `columns`, `cards`.
- No `boards` table for the MVP. One user's board is all `columns` and `cards` for that `user_id`.
- Keep AI chat history out of the database. Chat history stays in browser `sessionStorage`.
- Store column and card ids as text so API responses can match the current frontend `BoardData` ids.

## Tables

### `users`

Stores app users. The MVP has one seeded user, but the schema supports more users later.

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);
```

Notes:
- Seed `username = 'user'` and `password = 'password'`.
- Password is plain text only because MVP login is client-only and hardcoded. Replace this before adding real backend auth.

### `columns`

Stores Kanban columns for each user.

```sql
CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_columns_user_position
  ON columns (user_id, position);
```

Notes:
- `id` matches frontend ids such as `col-backlog`.
- `position` is zero-based ordering within one user's board.
- Deleting a user deletes that user's columns.

### `cards`

Stores cards inside columns.

```sql
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  column_id TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cards_column_position
  ON cards (column_id, position);
```

Notes:
- `id` matches frontend ids such as `card-1`.
- `position` is zero-based ordering within one column.
- Deleting a column deletes its cards.

## Seed data

On startup:

1. Enable foreign keys with `PRAGMA foreign_keys = ON`.
2. Create the tables if missing.
3. If the `users` table is empty, insert the demo user and the demo board below.

Seed columns:

| position | id | title |
| --- | --- | --- |
| 0 | `col-backlog` | Backlog |
| 1 | `col-discovery` | Discovery |
| 2 | `col-progress` | In Progress |
| 3 | `col-review` | Review |
| 4 | `col-done` | Done |

Seed cards:

| column | position | id | title | details |
| --- | --- | --- | --- | --- |
| `col-backlog` | 0 | `card-1` | Align roadmap themes | Draft quarterly themes with impact statements and metrics. |
| `col-backlog` | 1 | `card-2` | Gather customer signals | Review support tags, sales notes, and churn feedback. |
| `col-discovery` | 0 | `card-3` | Prototype analytics view | Sketch initial dashboard layout and key drill-downs. |
| `col-progress` | 0 | `card-4` | Refine status language | Standardize column labels and tone across the board. |
| `col-progress` | 1 | `card-5` | Design card layout | Add hierarchy and spacing for scanning dense lists. |
| `col-review` | 0 | `card-6` | QA micro-interactions | Verify hover, focus, and loading states. |
| `col-done` | 0 | `card-7` | Ship marketing page | Final copy approved and asset pack delivered. |
| `col-done` | 1 | `card-8` | Close onboarding sprint | Document release notes and share internally. |

## API board shape

The backend should return the same shape the frontend uses today:

```ts
type BoardData = {
  columns: {
    id: string;
    title: string;
    cardIds: string[];
  }[];
  cards: Record<
    string,
    {
      id: string;
      title: string;
      details: string;
    }
  >;
};
```

Read mapping:

- Query `columns` by `user_id`, ordered by `position`.
- Query cards for those columns, ordered by `position`.
- Build each column's `cardIds` from cards in that column.
- Build `cards` as a record keyed by card id.

Write mapping:

- For focused user actions, update the affected normalized rows and reindex positions as needed.
- For full board replacement (`PUT /api/board` and future AI updates), replace the user's columns and cards in one SQLite transaction:
  1. Delete existing rows for the user's columns. Cards cascade-delete.
  2. Insert replacement columns in array order.
  3. Insert replacement cards by walking each column's `cardIds` in order.
  4. Commit only if the whole board is valid.

## Validation rules

Before saving a full replacement board:

- Every column id is unique.
- Every card id is unique.
- Every `cardId` referenced by a column exists in `cards`.
- Every card appears in exactly one column.
- Column titles and card titles are non-empty after trimming.
- Card details may be empty, but should be stored as an empty string rather than `NULL`.

## Status

Implemented in `backend/database.py` with backend API tests in `backend/tests/test_api.py`.
