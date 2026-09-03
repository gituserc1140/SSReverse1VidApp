# Framefoundry Project Notes

## What This Project Is

Framefoundry is a small Node.js web app for turning a written video brief into a structured video plan and submitting that plan to Shotstack. It is an application, not a reusable framework like Streamlit.

The repository owner is the GitHub account `gituserc1140`. The code does not establish a separate company, trademark owner, or legal entity for the Framefoundry name.

## Run It

Requirements:

- Node.js 18 or newer
- An OpenAI-compatible API key for AI planning (optional)
- A Shotstack API key for live rendering (optional)

Commands:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Run tests:

```bash
npm test
```

The project currently has two Node tests, and they passed during the last verification.

## Configuration

Copy the template to a local, ignored environment file:

```bash
cp .env.example .env
```

Set these values in `.env`:

```env
PORT=3000
SHOTSTACK_API_KEY=
SHOTSTACK_API_URL=https://api.shotstack.io/stage/render
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

The server now loads `.env` automatically at startup. Restart it after changing the file. The health endpoint reports only boolean provider status:

```bash
curl http://localhost:3000/api/health
```

The sandbox endpoint is `https://api.shotstack.io/stage/render`. The production endpoint discussed during development is `https://api.shotstack.io/edit/v1/render`; use the endpoint that matches the key and account environment shown by Shotstack.

Never put real keys in source control, browser JavaScript, prompts, screenshots, or chat. `.env` is ignored by `.gitignore`. At the time these notes were written, `.env.example` still contained real-looking key values and must be cleaned to contain blank placeholders. Any keys previously exposed should be revoked and regenerated.

## User Flow

1. Open the local URL.
2. Enter a video brief.
3. Select a template.
4. Click `Plan my video`.
5. Review scenes and estimated credits.
6. Click `Render this video`.
7. Wait for Shotstack and open the resulting video link.

## Current Templates

- `TikTok vertical`: default option; intended for short-form vertical output.
- `General story`: standard story structure.
- `Product promo`: product-focused structure.

The TikTok template was added to use `9:16`, short 8-15 second pacing guidance, a hook, a value/product message, and a call to action. General and product promo renders use `16:9`.

The selected template controls the output format. The prompt currently does not automatically detect TikTok, Reels, Shorts, or another platform.

## Architecture

- `server.js`: native Node HTTP server, static file serving, JSON API routes, environment loading, prompt planning, Shotstack submission, and render polling.
- `public/index.html`: single-page interface and template selector.
- `public/app.js`: calls `/api/plan`, displays the plan, calls `/api/render`, and polls render status.
- `public/styles.css`: visual styling.
- `test/server.test.js`: normalization, timeline, and local planner tests.
- `.env.example`: configuration template; keep it free of real secrets.
- `.gitignore`: ignores `.env`.

API routes:

- `GET /api/health`
- `POST /api/plan` with `{ "prompt": "...", "template": "..." }`
- `POST /api/render` with a plan
- `GET /api/render/:id`

## Important Limitations

The current renderer is still a prototype:

- The timeline uses Shotstack title clips and a soundtrack URL; it does not find or generate real sneaker footage automatically.
- The AI response is normalized to scenes containing text and duration, not richer scene types such as `hook`, `b_roll`, `product_demo`, `voiceover`, or `call_to_action`.
- TikTok support currently changes pacing guidance and aspect ratio, but does not provide a complete TikTok editing system with captions, safe zones, media selection, or voiceover.
- Demo mode returns one fixed public sample MP4 when no Shotstack key is loaded. It is not customized to the prompt.
- Shotstack errors now preserve the provider HTTP status and nested message where available. A `403` usually indicates an invalid, revoked, mismatched, or unauthorized key/environment.
- The current server has no authentication, rate limiting, persistent job storage, or production deployment configuration.

## Reset / Continue Options

To continue later, keep this file and the source code, then run `npm test` and `npm start`.

To start a new blank version while retaining the learnings, preserve `PROJECT_NOTES.md` and `.env.example`, then replace or archive the implementation files under `public/`, `server.js`, and `test/`. Do not carry over `.env` or any generated media unless intentionally needed.

The worktree previously contained an untracked generated MP4 file. Decide whether to delete or archive that artifact before a clean restart.

## Recommended Next Build

For a fuller TikTok generator:

1. Define a scene schema with types such as `hook`, `b_roll`, `product_demo`, `social_proof`, and `call_to_action`.
2. Add media inputs or a licensed stock-media provider instead of relying on title-only clips.
3. Generate captions and voiceover as separate timeline layers.
4. Add safe-area-aware vertical layouts and a preview.
5. Add platform presets for TikTok, Instagram Reels, and YouTube Shorts.
6. Validate media licenses and Shotstack account permissions before publishing.
