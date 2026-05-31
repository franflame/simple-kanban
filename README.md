# AI Kanban Board

A simple Dockerized Kanban board built with:

- React single-page frontend
- Node.js / Express backend
- MySQL database
- Gemini-powered daily task summary

The board supports columns, cards, due dates, editing, drag-and-drop moving, deleting, and per-column sorting by inferred urgency or due date. The AI feature reads all tasks, descriptions, due dates, and statuses, then generates a higher-level daily briefing plus a suggested order of work.

## Run the app

```bash
cp .env.example .env
# Add your Gemini API key and replace the example database passwords in .env

docker compose up --build
```

Open:

- Frontend: http://localhost:3000
- Backend health check: http://localhost:5000/api/health
- MySQL: localhost:3306

## Environment variables

```env
AI_API_KEY=your_gemini_key_here
AI_MODEL=gemini-2.5-flash
AI_PROVIDER=gemini
AI_API_URL=
VITE_API_BASE_URL=http://localhost:5000/api
MYSQL_ROOT_PASSWORD=change-me-root-password
MYSQL_DATABASE=kanban
MYSQL_USER=change-me-app-user
MYSQL_PASSWORD=change-me-app-password
```

`AI_API_URL` can stay blank for Gemini because the backend builds the Gemini `generateContent` URL internally.
The MySQL values are read from `.env` by Docker Compose so real database credentials do not need to be committed.

## AI feature

Click **Generate Daily Summary** in the UI.

The AI response is intentionally compact:

```json
{
  "source": "gemini",
  "summary": "The main risk today is keeping the demo path stable while finishing the payment work. Start by resolving the login flow, then handle the payment integration before spending time on polish or documentation.",
  "suggestedOrder": [
    "Fix login redirect bug",
    "Complete payment integration",
    "Write README setup notes"
  ]
}
```

If no key is provided, the app still works and uses a deterministic local fallback summary based on due dates, status, and task wording.

## API routes

### Board

```http
GET /api/board
```

Returns columns and cards.

### Cards

```http
POST /api/cards
PUT /api/cards/:id
PUT /api/cards/:id/move
DELETE /api/cards/:id
```

### AI

```http
POST /api/ai/daily-summary
```

Returns:

```json
{
  "source": "gemini",
  "summary": "A higher-level briefing for the current board.",
  "suggestedOrder": ["Task one", "Task two"]
}
```

## Project structure

```text
kanban-ai-board/
  docker-compose.yml
  .env.example
  README.md
  database/
    init.sql
  backend/
    Dockerfile
    package.json
    src/
      server.js
      db.js
      routes/
        boardRoutes.js
        cardRoutes.js
        aiRoutes.js
  frontend/
    Dockerfile
    package.json
    index.html
    src/
      main.jsx
      styles.css
```

## Notes

- MySQL is seeded with three columns and realistic sample cards.
- Cards can be moved by dragging them onto another column.
- Data persists in the Docker volume `mysql_data`.
- To reset the database and reload the seed data, run:

```bash
docker compose down -v
docker compose up --build
```
