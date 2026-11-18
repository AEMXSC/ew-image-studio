/**
 * DOM helpers shared by the views. Text goes in as text nodes only: nothing
 * from the page, DA or the model is ever parsed as HTML.
 *
 * Controls are Experience Workspace's shared Spectrum 2 components
 * (da.live/nx2/blocks/shared, loaded in studio.js) and its style-guide
 * classes; icons are the S2 workflow icons in ./img/icons, the folder the
 * shared components also read their icons from (codeBase).
 */
import { safeUrl } from './model.js';

export const CODE_BASE = new URL('.', import.meta.url).href.replace(/\/$/, '');
const ICON_NAME = /^[a-z0-9]+$/;

/** An S2 icon from ./img/icons (s2-icon-{name}-20-n.svg), drawn in currentColor. */
export function icon(name) {
  if (!ICON_NAME.test(name)) throw new Error(`Unknown icon ${name}`);
  const span = document.createElement('span');
  span.className = 'is-icon';
  span.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${CODE_BASE}/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
  return span;
}

/**
 * Tiny hyperscript helper. `href` only accepts http(s) URLs; `key` marks a
 * focusable element so focus survives re-renders; `props` sets properties
 * (for the shared components' items/value/checked).
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return;
    if (k === 'className') node.className = v;
    else if (k === 'key') node.dataset.key = v;
    else if (k === 'href') node.setAttribute('href', safeUrl(v) || '#');
    else if (k === 'value') node.value = v;
    else if (k === 'props') Object.assign(node, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  });
  children.flat().forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return node;
}

/** Links that leave the panel; the label tells screen-reader users it opens a new tab. */
export function external(href, label, props = {}) {
  return el('a', {
    ...props, href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${label} (opens in a new tab)`,
  }, label);
}

/** A labelled button with a leading S2 icon (nx-action-btn family). */
export function iconButton(iconName, label, props = {}) {
  return el('button', { type: 'button', ...props }, icon(iconName), el('span', {}, label));
}

/** nx-segmented-btn: one choice from a few. */
export function segmented({ label, items, value, onChange, key, size = 'm' }) {
  return el('nx-segmented-btn', {
    key, size, props: { label, items, value }, onChange: (e) => onChange(e.detail.value),
  });
}

/** nx-switch: a setting that applies straight away. */
export function toggle({ label, checked, onChange, key }) {
  return el('nx-switch', { key, size: 'sm', props: { label, checked }, onChange: (e) => onChange(e.detail.checked) });
}

/** nx-picker as a form field. */
export function picker({ items, value, onChange, key, label }) {
  return el('nx-picker', {
    key, variant: 'field', size: 'm', 'aria-label': label, props: { items, value }, onChange: (e) => onChange(e.detail.value),
  });
}

/** nx-menu behind an icon button; `items` are { id, label, icon? }. */
export function menu({ label, items, onSelect, key, slot }) {
  // Run the action after the menu has closed: it may re-render the panel and remove the menu.
  return el('nx-menu', { key, slot, props: { items }, onSelect: (e) => setTimeout(() => onSelect(e.detail.id)) },
    el('button', {
      type: 'button', slot: 'trigger', className: 'nx-action-btn-icon', 'aria-label': label, title: label,
    }, icon('more')));
}
