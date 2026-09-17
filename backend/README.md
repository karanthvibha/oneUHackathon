# Lumen Flask Backend

A Python Flask API that keeps the model credentials server-side. Both the AI Tutor and
Smart Notes use the SAME model through Amazon Bedrock's OpenAI-compatible API. The React
frontend never receives the secret key.

## Setup

The repo root's `npm run dev` creates the virtualenv and installs dependencies
automatically. To do it manually:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set your Bedrock API key (and model/endpoint if you want to change them).

## Run

```bash
python wsgi.py
```

The server listens on `http://localhost:5001` by default.

## Configuration

All model + Bedrock settings live in `backend/.env` (see `backend/.env.example`), not in the UI:

- `TUTOR_MODEL_ID` — the single model used by the AI Tutor and Smart Notes (default `openai.gpt-oss-120b`).
- `OPENAI_BASE_URL` — Bedrock's OpenAI-compatible endpoint for your region.
- `OPENAI_API_KEY` — your Amazon Bedrock API key (Bedrock console → API keys).
- `TUTOR_MATERIALS_FOLDER` — folder with the course PDFs used by tutor retrieval.
- `CORS_ORIGINS` / `PORT` / `FLASK_DEBUG` — Flask options.

## Endpoints

- `GET /api/health` — liveness check.
- `POST /api/tutor/ask` — asks the RAG tutor a question (`{student_id, question, language}` → `{answer}`).
- `POST /api/tutor/evaluate` — grades a student answer (`{question, correct_answer, student_answer}` → `{correct, feedback}`).
- `POST /api/tutor/practice-question` — generates a practice question (`{student_id, concept, difficulty, language}`).
- `POST /api/tutor/reset-history` — clears a student's tutor history (`{student_id}`).
- `POST /api/bedrock/integrate-notes` — turns an uploaded file into Smart Notes (multipart `file`, `existingNotesJson`, `foldersJson`).
- `POST /api/bedrock/integrate-text` — turns clipped text into Smart Notes (`{text, existingNotes, folders}`).

## Security

The `.env` file is git-ignored; use `.env.example` as a template. Never commit the API key.