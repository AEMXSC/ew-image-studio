/**
 * Pure logic: no DOM, no network. Unit-tested in test/model.test.js.
 *
 * Prompts, page reading, file naming and DA paths live here so the panel
 * and the model adapters stay thin.
 */

/** Shapes offered to the author, named by where the image goes. */
export const ASPECTS = Object.freeze([
  { id: '16:9', label: 'Hero' },
  { id: '4:3', label: 'Card' },
  { id: '1:1', label: 'Square' },
  { id: '3:4', label: 'Portrait' },
]);

export const VARIANTS = 3;
export const MAX_REFERENCES = 3;
export const STUDIO_FOLDER = '/media/studio';
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
const DA_CONTENT = 'https://content.da.live';
const DA_SOURCE = 'https://admin.da.live/source';

// ---------- page reading ----------

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeEntities(s) {
  // &amp; last, so "&amp;lt;" stays "&lt;" instead of becoming "<".
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : '';
}

/**
 * What the page is about, from its HTML: the first heading, the opening copy
 * (up to `limit` characters) and its images, in document order.
 */
export function readPage(html = '', limit = 600) {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = h1 ? stripTags(h1[1]) : '';
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((t) => t.length > 20);
  let text = '';
  paragraphs.every((p) => {
    text = text ? `${text} ${p}` : p;
    return text.length < limit;
  });
  if (text.length > limit) text = `${text.slice(0, limit).replace(/\s+\S*$/, '')}…`;
  const seen = new Set();
  const images = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((m) => ({ src: attr(m[0], 'src'), alt: attr(m[0], 'alt') }))
    .filter((i) => safeUrl(i.src) && !seen.has(i.src) && seen.add(i.src));
  return { title, text, images };
}

// ---------- prompts ----------

const NO_TEXT = 'No words, letters or logos in the image.';
const NO_OTHER_TEXT = 'Keep the labels on the reference products exactly as they are; no other words, letters or logos anywhere.';

/** Starting prompt for a new image, from the page. The author edits it before generating. */
export function pagePrompt({ title, text }, aspect = '16:9') {
  const use = ASPECTS.find((a) => a.id === aspect)?.label.toLowerCase() ?? 'hero';
  if (!title && !text) return `A ${use} image for this web page. Photographic, natural light.`;
  const about = [title && `"${title}"`, text && `The page says: ${text}`].filter(Boolean).join('. ');
  // Not "room for a headline": the model then paints a (garbled) headline into the picture.
  return `A ${use} image for a web page titled ${about}\nPhotographic, natural light, with calm empty space on one side; the page adds its own text.`;
}

/**
 * The text sent to the model. `kind` is 'generate' or 'edit'; reference
 * images follow the edited image in the request, in the same order.
 */
export function buildPrompt({ kind, prompt, references = 0, style = '' }) {
  const lines = [];
  if (kind === 'edit') {
    lines.push(`Edit the first image: ${prompt.trim()}`);
    lines.push('Keep everything you were not asked to change as it is: composition, people, products and colours.');
  } else {
    lines.push(prompt.trim());
  }
  if (references) {
    let which = references === 1 ? 'The image is' : 'The images are';
    if (kind === 'edit') which = 'The other images are';
    lines.push(`${which} references: show the products in them exactly as they look (shape, label, colours). Don't redesign them.`);
  }
  if (style.trim()) lines.push(`Brand style: ${style.trim()}`);
  // "No text" alone makes the model blank out the labels of the reference products.
  lines.push(references ? NO_OTHER_TEXT : NO_TEXT);
  return lines.join('\n');
}

export const ALT_PROMPT = 'Write alt text for this image for a web page: one plain sentence, under 125 characters, '
  + 'describing what it shows. Don\'t start with "Image of" or "Picture of". Reply with the alt text only.';

/** Tidies a model's alt-text reply: one line, no quotes or "Image of", at most 150 characters. */
export function cleanAlt(text = '') {
  let alt = text.replace(/\s+/g, ' ').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  alt = alt.replace(/^(an? )?(image|picture|photo(graph)?) (of|showing) /i, '');
  if (alt.length > 150) alt = `${alt.slice(0, 149).replace(/\s+\S*$/, '')}…`;
  return alt ? alt[0].toUpperCase() + alt.slice(1) : '';
}

// ---------- files and paths ----------

/** Readable, unique file name: the prompt's first words plus a timestamp. */
export function fileName(prompt, mime = 'image/jpeg', now = new Date()) {
  const words = prompt.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/^(edit the first image: )/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !['a', 'an', 'the', 'for', 'of', 'and', 'with', 'image', 'web', 'page'].includes(w))
    .slice(0, 6);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${words.join('-') || 'studio'}-${stamp}.${extFor(mime)}`;
}

export function extFor(mime = '') {
  return { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] ?? 'jpg';
}

export function normalizeFolder(folder = '') {
  const f = `/${folder.trim()}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return f || '/';
}

/** The folder of a page path: "/blog/atelier-taste" → "/blog". */
export function pageFolder(path = '/') {
  const p = normalizeFolder(path);
  return p.slice(0, p.lastIndexOf('/')) || '/';
}

/** Where the editor points an image stored in DA (what goes in <img src>). */
export function contentUrl(org, site, path) {
  return `${DA_CONTENT}/${org}/${site}${normalizeFolder(path)}`;
}

/**
 * The signed-in API address that serves a DA image's bytes, or '' when the
 * URL isn't one of this org's DA files. Only these get the author's sign-in.
 */
export function sourceUrl(url, org) {
  try {
    const u = new URL(url);
    if (u.origin !== DA_CONTENT) return '';
    if (!u.pathname.startsWith(`/${org}/`)) return '';
    return `${DA_SOURCE}${u.pathname}`;
  } catch {
    return '';
  }
}

/** Public Edge Delivery media (aem.page / aem.live): fetched without any sign-in. */
export function isPublicMedia(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /\.aem\.(page|live)$/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Images in a DA folder listing, newest first. The list API returns paths
 * with the org and site in front ("/org/site/media/x.png").
 */
export function libraryItems(list, org, site) {
  const prefix = `/${org}/${site}`;
  return (Array.isArray(list) ? list : [])
    .filter((e) => e?.path && IMAGE_EXT.test(e.path))
    .map((e) => {
      const path = e.path.startsWith(`${prefix}/`) ? e.path.slice(prefix.length) : e.path;
      return {
        path,
        name: path.split('/').pop(),
        modified: Number(e.lastModified) || 0,
        src: contentUrl(org, site, path),
      };
    })
    .sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
}

export function filterLibrary(items, query = '') {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.name.toLowerCase().includes(q));
}

/** The HTML that puts an image in the page, with its alt text. */
export function imageHtml({ src, alt = '' }) {
  return `<p><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"></p>`;
}

/** Brand style from the site config's "image-studio" sheet (key "style"). */
export function styleFromConfig(config) {
  const sheet = config?.['image-studio'] ?? (config?.[':names'] ? null : config);
  const rows = Array.isArray(sheet?.data) ? sheet.data : [];
  const row = rows.find((r) => String(r.key ?? '').trim().toLowerCase() === 'style');
  return String(row?.value ?? '').trim();
}

/** Picks the default image model: Flash before Pro, full before Lite, stable before preview, newest first. */
export function pickImageModel(models) {
  const score = (id) => {
    const version = Number((/gemini-(\d+(?:\.\d+)?)/.exec(id) ?? [])[1] ?? 0);
    return (id.includes('flash') ? 1000 : 0) + (id.includes('lite') ? 0 : 500)
      + (id.includes('preview') ? 0 : 100) + version;
  };
  return [...models].sort((a, b) => score(b.id) - score(a.id))[0]?.id ?? '';
}

export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
