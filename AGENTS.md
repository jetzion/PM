# The Project Management MVP web app

## Business Requirements

This project is building a Project Management App. Key features:
- A user can sign in
- When signed in, the user sees a Kanban board representing their project
- The Kanban board has columns that the user and the AI can add, rename, and delete
- The cards on the Kanban board can be moved with drag and drop, and edited
- Users and the AI can create, edit, move, and delete cards
- There is an AI chat feature in a sidebar; the AI can create / edit / move / delete cards and add / rename / delete columns

## Limitations

For the MVP, there will only be a user sign in (hardcoded to 'user' and 'password', client-only) but the database will support multiple users for future.

For the MVP, there will only be 1 Kanban board per signed in user.

For the MVP, this will run locally (in a docker container)

AI chat history stays in the current browser session only. When the AI updates the board, it returns a full replacement board.

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `openai/gpt-oss-120b` as the model
- Use SQLite local database for the database, creating a new db if it doesn't exist
- Normalized tables (users, columns, cards). Seed the dummy user with the frontend demo board.
- Start and Stop server scripts for Mac, PC, Linux in scripts/
- App listens on port 8000
- SQLite file is stored on a Docker volume so it survives container restarts

## Starting Point

A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.