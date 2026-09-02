const prompt = document.querySelector('#prompt');
const template = document.querySelector('#template');
const planButton = document.querySelector('#plan');
const result = document.querySelector('#result');
const error = document.querySelector('#error');
let currentPlan;

function showPlan(plan) {
  currentPlan = plan;
  result.classList.remove('empty');
  result.innerHTML = `<p class="eyebrow">AGENT PLAN · ${plan.template.toUpperCase()}</p><h2 class="plan-title">${escapeHtml(plan.title)}</h2>
    ${plan.scenes.map(scene => `<div class="scene"><i class="swatch" style="background:${scene.color}"></i><span>${escapeHtml(scene.text)}</span><span>${scene.duration}s</span></div>`).join('')}
    <div class="cost"><b>Estimated cost: ${plan.estimatedCredits} credit${plan.estimatedCredits === 1 ? '' : 's'}</b><br><small>${plan.duration}s HD render estimate; actual usage depends on your Shotstack plan.</small></div>
    <button class="render" id="render">Render this video →</button><div id="status" class="status"></div>`;
  document.querySelector('#render').onclick = render;
}

async function plan() {
  error.textContent = ''; planButton.disabled = true; planButton.textContent = 'Planning…';
  try {
    const response = await fetch('/api/plan', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({prompt: prompt.value, template: template.value}) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error);
    showPlan(body);
  } catch (e) { error.textContent = e.message; } finally { planButton.disabled = false; planButton.innerHTML = 'Plan my video <span>→</span>'; }
}

async function render() {
  const button = document.querySelector('#render'); const status = document.querySelector('#status');
  button.disabled = true; button.textContent = 'Sending to Shotstack…';
  try {
    const response = await fetch('/api/render', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(currentPlan) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error);
    if (body.status === 'done') return complete(body);
    status.textContent = `Render ${body.id} is ${body.status}…`; poll(body.id, status);
  } catch (e) { status.textContent = e.message; button.disabled = false; button.textContent = 'Try rendering again →'; }
}

async function poll(id, status) {
  const body = await (await fetch(`/api/render/${id}`)).json();
  status.textContent = `Render is ${body.status}…`;
  if (body.status === 'done') complete(body); else if (body.status === 'failed') status.textContent = 'Shotstack could not render this video.'; else setTimeout(() => poll(id, status), 4000);
}
function complete(body) { document.querySelector('#status').innerHTML = 'Your video is ready.'; const link = document.createElement('a'); link.className = 'download'; link.href = body.url; link.target = '_blank'; link.textContent = 'Watch or download video →'; document.querySelector('#status').append(link); }
function escapeHtml(value) { return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])); }
planButton.onclick = plan;
