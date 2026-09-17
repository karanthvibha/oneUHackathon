# Lumen Flask Backend

A Python Flask API that keeps Amazon Bedrock credentials server-side and invokes models
through the Bedrock Converse API. The React frontend never receives the secrets.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set the AWS region, model ID, and credentials (or rely on your
environment's default AWS credential chain / IAM role).

## Run

```bash
python wsgi.py
```

The server listens on `http://localhost:5001` by default.

## Endpoints

- `GET /api/health` — liveness check.
- `GET /api/bedrock/status` — returns whether credentials are configured, the region,
  and model ID. Never returns secret values.
- `POST /api/bedrock/invoke` — invokes Amazon Bedrock.

Request body for `/api/bedrock/invoke`:

```json
{
  "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "messages": [
    { "role": "user", "content": [{ "text": "Explain osmosis." }] }
  ],
  "inferenceConfig": {
    "temperature": 0.7,
    "maxTokens": 1024
  }
}
```

Response:

```json
{
  "text": "Osmosis is ...",
  "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0"
}
```

## Security

Store secrets in environment variables (or AWS IAM roles / AWS Secrets Manager), never
in the frontend. The `.env` file is git-ignored; use `.env.example` as a template.