# oneUHackathon
Hackathon Track

## Getting started

One command runs the whole app (Flask backend + Vite frontend):

```bash
npm install     # frontend dependencies (once)
npm run dev     # boots the backend (auto-creates backend/.venv) + frontend
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:5001  (`GET /api/health` → `{"status":"ok"}`)

## Backend config (Amazon Bedrock)

Model + AWS settings live in `backend/.env` (see `backend/.env.example`). Copy it once:

```bash
cp backend/.env.example backend/.env
```

Then fill in your AWS region, credentials, and model IDs. `npm run dev` creates the
virtualenv and installs `backend/requirements.txt` automatically on first run.

