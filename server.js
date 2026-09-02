const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const port = Number(process.env.PORT || 3000);
const shotstackUrl = process.env.SHOTSTACK_API_URL || 'https://api.shotstack.io/stage/render';
const jobs = new Map();
const publicDir = path.join(__dirname, 'public');

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('Request is too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function planVideo(prompt, template = 'general') {
  const cleanPrompt = String(prompt || '').trim();
  const words = cleanPrompt.split(/\s+/).filter(Boolean);
  const subject = words.slice(0, 8).join(' ') || 'your story';
  const title = subject.length > 42 ? `${subject.slice(0, 39)}…` : subject;
  const scenes = template === 'promo'
    ? [
        { text: `Meet ${title}`, duration: 3, color: '#6d5dfc' },
        { text: 'Designed for the way you move', duration: 4, color: '#12b886' },
        { text: 'Make your next idea unforgettable', duration: 3, color: '#ff7a59' }
      ]
    : [
        { text: title, duration: 4, color: '#6d5dfc' },
        { text: 'Here is what matters most', duration: 4, color: '#12b886' },
        { text: 'Start creating today', duration: 4, color: '#ff7a59' }
      ];
  const duration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  return {
    prompt: cleanPrompt,
    template,
    title,
    duration,
    scenes,
    estimatedCredits: Math.max(1, Math.ceil(duration / 10)),
    timeline: {
      soundtrack: { src: 'https://cdn.coverr.co/audio/Midnight-Drive.mp3', effect: 'fadeInFadeOut' },
      tracks: [{ clips: scenes.map((scene, index) => ({
        asset: { type: 'title', text: scene.text, style: 'minimal' },
        start: scenes.slice(0, index).reduce((sum, item) => sum + item.duration, 0),
        length: scene.duration,
        transition: { in: 'fade', out: 'fade' }
      })) }]
    }
  };
}

async function createRender(plan) {
  if (!process.env.SHOTSTACK_API_KEY) {
    const id = crypto.randomUUID();
    jobs.set(id, { id, status: 'done', url: 'https://cdn.coverr.co/videos/coverr-a-man-walking-in-the-city-1572/1080p.mp4', demo: true });
    return { id, status: 'done', url: jobs.get(id).url, demo: true };
  }
  const response = await fetch(shotstackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.SHOTSTACK_API_KEY },
    body: JSON.stringify({ timeline: plan.timeline, output: { format: 'mp4', resolution: 'hd' } })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Shotstack rejected the render');
  const id = body.response?.id || body.id;
  jobs.set(id, { id, status: 'queued' });
  return { id, status: 'queued' };
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true });
  if (req.method === 'POST' && url.pathname === '/api/plan') {
    try {
      const body = await readBody(req);
      if (!String(body.prompt || '').trim()) return json(res, 400, { error: 'Describe the video you want to create.' });
      return json(res, 200, planVideo(body.prompt, body.template));
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/render') {
    try {
      const plan = await readBody(req);
      return json(res, 202, await createRender(plan));
    } catch (error) { return json(res, 502, { error: error.message }); }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/render/')) {
    const id = url.pathname.split('/').pop();
    if (process.env.SHOTSTACK_API_KEY && jobs.has(id)) {
      try {
        const response = await fetch(`${shotstackUrl}/${id}`, { headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY } });
        const body = await response.json();
        const render = body.response || body;
        jobs.set(id, { ...jobs.get(id), status: render.status, url: render.url });
      } catch { /* retain the last known status */ }
    }
    return jobs.has(id) ? json(res, 200, jobs.get(id)) : json(res, 404, { error: 'Render not found' });
  }
  if (req.method === 'GET') {
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const safePath = path.normalize(path.join(publicDir, file));
    if (!safePath.startsWith(publicDir)) return json(res, 403, { error: 'Forbidden' });
    try {
      const content = fs.readFileSync(safePath);
      const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(content);
    } catch { return json(res, 404, { error: 'Not found' }); }
  }
  return json(res, 404, { error: 'Not found' });
}

http.createServer((req, res) => router(req, res).catch(error => json(res, 500, { error: error.message }))).listen(port, () => {
  console.log(`Video agent listening on http://localhost:${port}`);
});
