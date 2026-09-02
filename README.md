# Framefoundry AI Video Agent

A small, dependency-free Node.js app that turns a natural-language brief into a video plan, estimates Shotstack credits, and submits a render.

## Run locally

```bash
npm start
```

Open <http://localhost:3000>. Without credentials, rendering uses a demo video so the complete flow can be explored.

For real renders, set `SHOTSTACK_API_KEY` (and optionally `SHOTSTACK_API_URL`) in the server environment. The key is never sent to the browser. Credit estimates are planning guidance only; Shotstack billing is determined by the account plan and actual render.
