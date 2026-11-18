import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API, createGeminiAdapter, readReply } from '../tools/studio/gemini.js';

function fakeFetch(replies) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const [status, body] = replies.shift();
    return { ok: status < 400, status, json: async () => body };
  };
  return { fetch, calls };
}

test('models: image models only, key in a header and never in the URL', async () => {
  const { fetch, calls } = fakeFetch([[200, {
    models: [
      { name: 'models/gemini-2.5-flash-image', displayName: 'Nano Banana', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash', displayName: 'Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/imagen-4.0-generate-001', displayName: 'Imagen', supportedGenerationMethods: ['predict'] },
    ],
  }]]);
  const models = await createGeminiAdapter({ key: 'SECRET', fetch }).models();
  assert.deepEqual(models, [{ id: 'gemini-2.5-flash-image', label: 'Nano Banana' }]);
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'SECRET');
  assert.ok(!calls[0].url.includes('SECRET'));
  assert.ok(calls[0].url.startsWith(API));
});

test('generate: sends prompt, input images and shape; returns the image', async () => {
  const { fetch, calls } = fakeFetch([[200, {
    candidates: [{ content: { parts: [{ text: 'Here you go' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }],
  }]]);
  const out = await createGeminiAdapter({ key: 'k', fetch }).generate({
    model: 'gemini-2.5-flash-image', prompt: 'Edit the first image: x', images: [{ mime: 'image/jpeg', data: 'BBBB' }], aspect: '16:9',
  });
  assert.deepEqual(out, { mime: 'image/png', data: 'AAAA' });
  const { body } = calls[0];
  assert.match(calls[0].url, /models\/gemini-2\.5-flash-image:generateContent$/);
  assert.equal(body.contents[0].parts[0].text, 'Edit the first image: x');
  assert.deepEqual(body.contents[0].parts[1], { inlineData: { mimeType: 'image/jpeg', data: 'BBBB' } });
  assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: '16:9' });
});

test('errors are readable and typed', async () => {
  const bad = fakeFetch([[400, { error: { message: 'API key not valid. Please pass a valid API key.' } }]]);
  await assert.rejects(createGeminiAdapter({ key: 'k', fetch: bad.fetch }).models(), { code: 'unauthorized' });
  const busy = fakeFetch([[429, { error: { message: 'Resource exhausted' } }]]);
  await assert.rejects(createGeminiAdapter({ key: 'k', fetch: busy.fetch }).models(), { code: 'quota' });
  const offline = createGeminiAdapter({ key: 'k', fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(offline.models(), { code: 'network' });
});

test('replies without an image say why', () => {
  assert.throws(() => readReply({ promptFeedback: { blockReason: 'SAFETY' } }), { code: 'blocked' });
  assert.throws(() => readReply({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }), { code: 'blocked' });
  assert.throws(() => readReply({ candidates: [{ content: { parts: [{ text: 'I can only describe it.' }] } }] }), /I can only describe it/);
  assert.equal(readReply({ candidates: [{ content: { parts: [{ text: ' A cup. ' }] } }] }, 'text'), 'A cup.');
});

test('describe: alt text from a text model, and never fails the save', async () => {
  const ok = fakeFetch([[200, { candidates: [{ content: { parts: [{ text: '"Image of a cup of coffee."' }] } }] }]]);
  assert.equal(await createGeminiAdapter({ key: 'k', fetch: ok.fetch }).describe({ mime: 'image/jpeg', data: 'A' }), 'A cup of coffee.');
  const denied = fakeFetch([[403, {}]]);
  assert.equal(await createGeminiAdapter({ key: 'k', fetch: denied.fetch }).describe({ mime: 'image/jpeg', data: 'A' }), '');
});
