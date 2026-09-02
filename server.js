const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const port = Number(process.env.PORT || 3000);
const shotstackUrl = process.env.SHOTSTACK_API_URL || 'https://api.shotstack.io/stage/render';
const openAiBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const jobs = new Map();
const publicDir = path.join(__dirname, 'public');
const scenePalette = ['#6d5dfc', '#12b886', '#ff7a59', '#fbbf24', '#38bdf8', '#f472b6', '#fb7185'];

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

function cleanPrompt(prompt) {
  return String(prompt || '').trim().replace(/\s+/g, ' ');
}

function ensureScene(scene, index) {
  const text = String(scene?.text || `Scene ${index + 1}`).trim();
  const duration = Number(scene?.duration) > 0 ? Number(scene.duration) : 3;
  return {
    text,
    duration,
    color: scene?.color || scenePalette[index % scenePalette.length]
  };
}

function buildFallbackScenes(prompt, template) {
  const clean = cleanPrompt(prompt);
  const words = clean.split(/\s+/).filter(Boolean);
  const subject = words.slice(0, 8).join(' ') || 'your story';
  const title = subject.length > 42 ? `${subject.slice(0, 39)}…` : subject;

  const base = template === 'promo'
    ? [
        { text: `Meet ${title}`, duration: 3 },
        { text: 'Show the product, the audience, and the payoff', duration: 4 },
        { text: 'Create a moment people want to share', duration: 3 }
      ]
    : [
        { text: title, duration: 4 },
        { text: 'Highlight the key message and emotional beat', duration: 4 },
        { text: 'Finish with a clear call to action', duration: 4 }
      ];

  return base.map((scene, index) => ensureScene(scene, index));
}

function buildTimeline(plan) {
  const scenes = Array.isArray(plan?.scenes) && plan.scenes.length ? plan.scenes : [{ text: plan?.title || 'Scene 1', duration: 4, color: '#6d5dfc' }];
  const trackClips = scenes.map((scene, index) => {
    const start = scenes.slice(0, index).reduce((sum, item) => sum + Number(item.duration || 0), 0);
    return {
      asset: { type: 'title', text: scene.text, style: 'minimal', color: '#ffffff' },
      start,
      length: Number(scene.duration || 0),
      transition: { in: 'fade', out: 'fade' }
    };
  });

  return {
    soundtrack: { src: 'https://cdn.coverr.co/audio/Midnight-Drive.mp3', effect: 'fadeInFadeOut' },
    tracks: [{ clips: trackClips }]
  };
}

function normalizePlan(rawPlan, template = 'general') {
  const prompt = cleanPrompt(rawPlan?.prompt || rawPlan?.brief || '');
  const providedScenes = Array.isArray(rawPlan?.scenes) ? rawPlan.scenes.map((scene, index) => ensureScene(scene, index)) : [];
  const scenes = providedScenes.length ? providedScenes : buildFallbackScenes(prompt || 'Create a compelling video', template);
  const title = String(rawPlan?.title || scenes[0]?.text || 'Untitled video').trim();
  const duration = scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0);

  return {
    prompt,
    template: rawPlan?.template || template,
    title,
    duration,
    summary: rawPlan?.summary || `A ${duration}-second video centered on ${title}.`,
    scenes,
    estimatedCredits: Math.max(1, Math.ceil(duration / 10)),
    timeline: rawPlan?.timeline || buildTimeline({ scenes, title })
  };
}

function extractJsonPayload(content) {
  if (!content) return null;
  const trimmed = String(content).trim();
  const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) || trimmed.match(/```\s*([\s\S]*?)\s*```/i);
  const candidate = jsonMatch ? jsonMatch[1] : trimmed;
  try { return JSON.parse(candidate); } catch { return null; }
}

async function generateAiPlan(prompt, template = 'general') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch(`${openAiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a video-producing assistant. Return only JSON with keys: title, summary, template, scenes. Each scene must contain text and duration. Do not include markdown or prose outside JSON.'
        },
        {
          role: 'user',
          content: `Create a video plan for this brief: ${prompt}. Use template: ${template}. Output a JSON object describing the title, summary, and 3-5 scenes with durations in seconds.`
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || 'AI plan request failed';
    throw new Error(message);
  }

  const parsed = extractJsonPayload(data?.choices?.[0]?.message?.content) || data?.choices?.[0]?.message?.content;
  if (!parsed || typeof parsed !== 'object') return null;

  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  if (!scenes.length) return null;

  return normalizePlan({ ...parsed, prompt, template }, template);
}

async function planVideo(prompt, template = 'general') {
  const clean = cleanPrompt(prompt);
  if (!clean) {
    throw new Error('Describe the video you want to create.');
  }

  try {
    const aiPlan = await generateAiPlan(clean, template);
    if (aiPlan) return aiPlan;
  } catch (error) {
    console.warn('AI plan generation failed, falling back to local planner:', error.message);
  }

  const fallback = buildFallbackScenes(clean, template);
  const title = clean.split(/\s+/).slice(0, 8).join(' ') || 'Your story';
  return normalizePlan({
    prompt: clean,
    template,
    title: title.length > 42 ? `${title.slice(0, 39)}…` : title,
    summary: `A ${template === 'promo' ? 'promo' : 'story'} video built around ${title}.`,
    scenes: fallback
  }, template);
}

async function createRender(plan) {
  const normalizedPlan = normalizePlan(plan || {}, plan?.template || 'general');
  if (!process.env.SHOTSTACK_API_KEY) {
    const id = crypto.randomUUID();
    const demoUrl = 'https://cdn.coverr.co/videos/coverr-a-man-walking-in-the-city-1572/1080p.mp4';
    jobs.set(id, { id, status: 'done', url: demoUrl, demo: true, plan: normalizedPlan });
    return { id, status: 'done', url: demoUrl, demo: true };
  }

  const payload = {
    timeline: normalizedPlan.timeline,
    output: {
      format: 'mp4',
      resolution: 'hd',
      fps: 30,
      aspectRatio: '16:9'
    }
  };

  const response = await fetch(shotstackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.SHOTSTACK_API_KEY
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message || body.error || 'Shotstack rejected the render');
  }

  const id = body.response?.id || body.id;
  if (!id) throw new Error('Shotstack did not return a render ID');

  jobs.set(id, { id, status: 'queued', plan: normalizedPlan });
  return { id, status: 'queued' };
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, hasOpenAi: Boolean(process.env.OPENAI_API_KEY), hasShotstack: Boolean(process.env.SHOTSTACK_API_KEY) });
  }

  if (req.method === 'POST' && url.pathname === '/api/plan') {
    try {
      const body = await readBody(req);
      const plan = await planVideo(body.prompt, body.template);
      return json(res, 200, plan);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/render') {
    try {
      const plan = await readBody(req);
      return json(res, 202, await createRender(plan));
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/render/')) {
    const id = url.pathname.split('/').pop();
    if (process.env.SHOTSTACK_API_KEY && jobs.has(id)) {
      try {
        const response = await fetch(`${shotstackUrl}/${id}`, {
          headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY }
        });
        const body = await response.json();
        const render = body.response || body;
        const record = jobs.get(id) || {};
        jobs.set(id, {
          ...record,
          status: render.status || record.status || 'queued',
          url: render.url || record.url,
          error: render.error || record.error
        });
      } catch (error) {
        console.warn('Render polling failed:', error.message);
      }
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
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return res.end(content);
    } catch {
      return json(res, 404, { error: 'Not found' });
    }
  }

  return json(res, 404, { error: 'Not found' });
}

function startServer() {
  http.createServer((req, res) => router(req, res).catch(error => json(res, 500, { error: error.message }))).listen(port, () => {
    console.log(`Video agent listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  buildTimeline,
  cleanPrompt,
  normalizePlan,
  planVideo,
  createRender,
  startServer
};
