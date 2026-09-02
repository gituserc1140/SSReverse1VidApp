# Framefoundry AI Video Agent

A dependency-free Node.js app that turns a natural-language brief into an AI-style video plan, estimates Shotstack credits, and submits a render job.

## Features

- Prompt-based video brief intake
- AI planning with OpenAI-compatible API support when configured
- Local fallback planner when no AI key is present
- Shotstack render job creation and polling
- Demo mode for local exploration without credentials

## Run locally

```bash
npm install
npm start
```

Open <http://localhost:3000>.

## Configuration

Set environment variables before running:

```bash
cp .env.example .env
```

Then fill in the values for:

- `SHOTSTACK_API_KEY` and optional `SHOTSTACK_API_URL`
- `OPENAI_API_KEY`, `OPENAI_MODEL`, and optional `OPENAI_BASE_URL`

Without credentials, the app falls back to demo rendering so the end-to-end flow can be explored without live API usage.

The API key is never sent to the browser. Credit estimates are planning guidance; camera, asset and render billing remains defined by the chosen Shotstack plan and final job result.
