/**
 * Replacing one image inside an EDS block.
 *
 * Workspace's `sendHTML(html, { replace: true })` swaps the WHOLE block the
 * cursor is in, so sending a lone <img> would throw away the block's text,
 * links and other images. Instead we take the block from the live document
 * (which keeps every image's original src), change one image, and send the
 * block back. Uses DOMParser, so it runs in the browser (tested there).
 */

const INSTRUMENTATION = ['data-block-index', 'data-prose-index', 'data-image-index', 'data-image-version',
  'data-cursor-remote', 'data-cursor-remote-color'];

function sortedBlocks(doc) {
  return [...doc.querySelectorAll('[data-block-index]')]
    .sort((a, b) => Number(a.dataset.blockIndex) - Number(b.dataset.blockIndex));
}

/** The selected block in a live-document snapshot: `blockIndex` is its 0-based order among blocks. */
function findBlock(doc, blockIndex) {
  return sortedBlocks(doc)[blockIndex] ?? null;
}

function parse(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function label(img, index) {
  const alt = (img.getAttribute('alt') ?? '').trim();
  if (alt) return alt;
  try {
    return decodeURIComponent(new URL(img.getAttribute('src') ?? '', 'https://x.invalid').pathname.split('/').pop()) || `Image ${index + 1}`;
  } catch {
    return `Image ${index + 1}`;
  }
}

/**
 * Finds the image whose file is `name` (as Workspace stored a dropped file) in a live-document
 * snapshot: { src, alt, blockIndex, which }, with blockIndex null outside a block. Null if absent.
 */
export function findImage(html, name) {
  const doc = parse(html);
  const img = [...doc.querySelectorAll('img')].find((i) => {
    try {
      return decodeURIComponent(new URL(i.getAttribute('src') ?? '', 'https://x.invalid').pathname.split('/').pop()) === name;
    } catch {
      return false;
    }
  });
  if (!img) return null;
  const block = img.closest('[data-block-index]');
  const blockIndex = block ? sortedBlocks(doc).indexOf(block) : null;
  return {
    src: img.getAttribute('src'),
    alt: (img.getAttribute('alt') ?? '').trim(),
    blockIndex,
    which: block ? [...block.querySelectorAll('img')].indexOf(img) : 0,
  };
}

/**
 * The selected block's name (its first class, e.g. "cards") and text, images left out and cut at
 * a word after `limit` characters. Null when the block isn't in the snapshot or has no name.
 * Workspace leaves page and section metadata out of the block index, so they never show up here.
 */
export function readBlock(html, blockIndex, limit = 400) {
  const block = findBlock(parse(html), blockIndex);
  const name = block?.classList[0]?.toLowerCase();
  if (!name) return null;
  let text = block.textContent.replace(/\s+/g, ' ').trim();
  if (text.length > limit) text = `${text.slice(0, limit).replace(/\s+\S*$/, '')}…`;
  return { name, text };
}

/** The images in the selected block, as [{ label }], or null when the block isn't in the snapshot. */
export function blockImages(html, blockIndex) {
  const block = findBlock(parse(html), blockIndex);
  if (!block) return null;
  return [...block.querySelectorAll('img')].map((img, i) => ({ label: label(img, i) }));
}

/**
 * The selected block's HTML with image `which` (0-based) swapped for `src`/`alt`.
 * Everything else in the block (text, links, other images) is sent back unchanged.
 */
export function swapBlockImage(html, blockIndex, which, { src, alt = '' }) {
  const block = findBlock(parse(html), blockIndex);
  const img = block?.querySelectorAll('img')[which];
  if (!img) return '';
  img.setAttribute('src', src);
  img.setAttribute('alt', alt);
  // The new file may differ in format from the old sources' declared type: drop the type.
  img.closest('picture')?.querySelectorAll('source').forEach((s) => { s.setAttribute('srcset', src); s.removeAttribute('type'); });
  [block, ...block.querySelectorAll('*')].forEach((node) => INSTRUMENTATION.forEach((a) => node.removeAttribute(a)));
  return block.outerHTML;
}
