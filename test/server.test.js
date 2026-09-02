const test = require('node:test');
const assert = require('node:assert/strict');

const { planVideo, normalizePlan, buildTimeline } = require('../server.js');

test('normalizePlan creates a valid timeline and credit estimate', () => {
  const plan = normalizePlan({
    prompt: 'Launch a sustainable sneaker campaign',
    template: 'promo',
    title: 'Sustainable Step',
    scenes: [
      { text: 'Meet the new sneaker', duration: 3, color: '#6d5dfc' },
      { text: 'Designed for everyday motion', duration: 4, color: '#12b886' },
      { text: 'Build a greener future', duration: 3, color: '#ff7a59' }
    ]
  }, 'promo');

  assert.equal(plan.template, 'promo');
  assert.equal(plan.duration, 10);
  assert.equal(plan.estimatedCredits, 1);
  assert.equal(plan.scenes.length, 3);
  assert.ok(plan.timeline);
  assert.equal(plan.timeline.tracks[0].clips.length, 3);
});

test('planVideo falls back to a local plan when no AI provider is configured', async () => {
  const plan = await planVideo('Create a fun launch video for a coffee brand', 'promo');

  assert.equal(plan.template, 'promo');
  assert.ok(plan.title.length > 0);
  assert.ok(Array.isArray(plan.scenes));
  assert.ok(plan.duration > 0);
  assert.ok(plan.estimatedCredits >= 1);
  assert.ok(buildTimeline(plan));
});
