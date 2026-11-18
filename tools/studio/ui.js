/**
 * DOM helpers shared by the views. Text goes in as text nodes only: nothing
 * from the page, DA or the model is ever parsed as HTML.
 */
import { safeUrl } from './model.js';

/** Spectrum 2 workflow icons (18px), trusted constants only. */
const ICONS = {
  more: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="16" cy="10" r="1.6"/></svg>',
  refresh: '<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.2 8.3A6.5 6.5 0 1 0 16 13"/><path d="M16.5 3.5v4.8h-4.8"/></svg>',
  sparkle: '<svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><path d="M8 2.5l1.3 3.7L13 7.5l-3.7 1.3L8 12.5 6.7 8.8 3 7.5l3.7-1.3zM14.5 11l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
  check: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="currentColor"/><path d="m6.5 10.2 2.4 2.4 4.6-4.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l10 10M15 5 5 15"/></svg>',
  plus: '<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 4v12M4 10h12"/></svg>',
  drag: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="5" r="1.4"/><circle cx="13" cy="5" r="1.4"/><circle cx="7" cy="10" r="1.4"/><circle cx="13" cy="10" r="1.4"/><circle cx="7" cy="15" r="1.4"/><circle cx="13" cy="15" r="1.4"/></svg>',
};

export function icon(name) {
  const span = document.createElement('span');
  span.className = 'is-icon';
  span.innerHTML = ICONS[name];
  return span;
}

/**
 * Tiny hyperscript helper. `href` only accepts http(s) URLs; `key` marks a
 * focusable element so focus survives re-renders.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return;
    if (k === 'className') node.className = v;
    else if (k === 'key') node.dataset.key = v;
    else if (k === 'href') node.setAttribute('href', safeUrl(v) || '#');
    else if (k === 'value') node.value = v;
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

/** A row of toggle buttons (S2 segmented control) for one choice; the chosen one is pressed. */
export function segmented({ label, options, value, onChange, key, disabled }) {
  return el('div', { className: 'is-seg', role: 'group', 'aria-label': label },
    options.map((o) => el('button', {
      type: 'button',
      key: `${key}-${o.id}`,
      className: `nx-action-btn nx-btn-sm${o.id === value ? ' on' : ''}`,
      'aria-pressed': String(o.id === value),
      disabled,
      title: o.title,
      onClick: () => onChange(o.id),
    }, o.label)));
}
