/**
 * Google Gemini image models ("Nano Banana") over the public REST API.
 *
 * This is the only file that knows Gemini. Another image model plugs in with
 * an adapter that has the same three methods (see README, "Other image models").
 * The key goes in a header, never in the URL, and only to Google: this uses
 * plain fetch, never Workspace's daFetch (which adds the author's Adobe sign-in).
 */
import { ALT_PROMPT, cleanAlt } from './model.js';

export const API = 'https://generativelanguage.googleapis.com/v1beta';
const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
const BLOCKED = new Set(['SAFETY', 'IMAGE_SAFETY', 'PROHIBITED_CONTENT', 'IMAGE_PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_RECITATION']);

export class ModelError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // unauthorized | quota | blocked | noimage | network | failed
  }
}

function toError(status, body) {
  const message = body?.error?.message ?? '';
  if (status === 401 || status === 403 || /api key/i.test(message)) {
    return new ModelError('unauthorized', 'Google didn\'t accept the API key. Check it in Google AI Studio and connect again.');
  }
  if (status === 429) {
    return new ModelError('quota', 'Google\'s rate or quota limit for this key was reached. Wait a minute, or check billing in Google AI Studio.');
  }
  return new ModelError('failed', message || `Google returned an error (${status}).`);
}

/** Pulls the first image (or text) out of a generateContent reply, or explains why there is none. */
export function readReply(body, want = 'image') {
  const blocked = body?.promptFeedback?.blockReason;
  if (blocked) throw new ModelError('blocked', 'Google declined this prompt. Try wording it differently.');
  const candidate = body?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  if (want === 'text') return parts.map((p) => p.text ?? '').join('').trim();
  const image = parts.find((p) => (p.inlineData ?? p.inline_data)?.data);
  if (image) {
    const data = image.inlineData ?? image.inline_data;
    return { mime: data.mimeType ?? data.mime_type ?? 'image/png', data: data.data };
  }
  if (BLOCKED.has(candidate?.finishReason)) {
    throw new ModelError('blocked', 'Google declined to make this image. Try a different prompt or reference.');
  }
  const said = parts.map((p) => p.text ?? '').join(' ').trim();
  throw new ModelError('noimage', said ? `No image came back. The model said: ${said.slice(0, 200)}` : 'No image came back. Try again.');
}

export function createGeminiAdapter({ key, fetch = (...a) => window.fetch(...a) }) {
  async function call(path, init = {}) {
    let resp;
    try {
      resp = await fetch(`${API}${path}`, {
        ...init,
        headers: { 'x-goog-api-key': key, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      });
    } catch {
      throw new ModelError('network', 'Couldn\'t reach Google. Check your connection.');
    }
    const body = await resp.json().catch(() => null);
    if (!resp.ok) throw toError(resp.status, body);
    return body;
  }

  const content = (text, images = []) => ({
    contents: [{
      role: 'user',
      parts: [{ text }, ...images.map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } }))],
    }],
  });

  return {
    /** Image models this key can use: [{ id, label }]. Also proves the key works. */
    async models() {
      const body = await call('/models?pageSize=1000');
      return (body?.models ?? [])
        .filter((m) => /image/.test(m.name) && !/imagen/.test(m.name)
          && (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
    },

    /** One image from a prompt plus optional input images (the edited image first, then references). */
    async generate({ model, prompt, images = [], aspect }) {
      const body = await call(`/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        body: JSON.stringify({
          ...content(prompt, images),
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            ...(aspect ? { imageConfig: { aspectRatio: aspect } } : {}),
          },
        }),
      });
      return readReply(body, 'image');
    },

    /** Alt text for an image, from a fast text model. Returns '' rather than failing the save. */
    async describe(image) {
      for (const model of TEXT_MODELS) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const body = await call(`/models/${model}:generateContent`, {
            method: 'POST',
            body: JSON.stringify(content(ALT_PROMPT, [image])),
          });
          return cleanAlt(readReply(body, 'text'));
        } catch (e) {
          if (e.code === 'unauthorized' || e.code === 'quota') return '';
        }
      }
      return '';
    },
  };
}
