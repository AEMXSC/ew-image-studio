/**
 * Create tab: generate from the page or edit an image, with optional
 * reference images, then accept the variants worth keeping.
 */
import { ASPECTS, MAX_REFERENCES, VARIANTS } from './model.js';
import {
  el, icon, iconButton, picker, segmented, toggle,
} from './ui.js';

const MODES = [
  { value: 'generate', label: 'New image' },
  { value: 'edit', label: 'Edit an image' },
];

export function thumb(ctx, key, alt = '') {
  return el('span', { className: `is-thumb${ctx.thumbFailed(key) ? ' broken' : ''}`, 'data-thumb-box': key },
    el('img', { src: ctx.thumbUrl(key) || undefined, 'data-thumb': key, alt }));
}

/** Upload button: a real file input inside an S2 quiet button, labelled for screen readers. */
function fromComputer(ctx, as, label) {
  const id = `is-file-${as}`;
  return el('label', { className: 'nx-action-btn-quiet nx-btn-sm is-file', for: id },
    icon('upload'),
    el('span', {}, label),
    el('input', {
      id,
      type: 'file',
      accept: 'image/*',
      multiple: as === 'ref',
      className: 'is-sr',
      onChange: (e) => { ctx.addFiles(e.target.files, as); e.target.value = ''; },
    }));
}

/** Images on the page and other ways to pick one. */
function chooser(ctx, { onPick, as, title }) {
  const { images } = ctx.state.page;
  return el('div', { className: 'is-picker' },
    el('p', { className: 'is-fine' }, title),
    images.length
      ? el('ul', { className: 'is-strip' }, images.map((i) => el('li', {},
        el('button', {
          type: 'button',
          className: 'is-pick',
          key: `pick-${as}-${i.src}`,
          'aria-label': `Use ${i.alt || i.src.split('/').pop()}`,
          onClick: () => onPick({ key: i.src, name: i.src.split('/').pop(), alt: i.alt }),
        }, thumb(ctx, i.src)))))
      : el('p', { className: 'is-fine' }, 'This page has no images yet.'),
    el('div', { className: 'is-row' },
      fromComputer(ctx, as, 'From your computer'),
      iconButton('folder', 'From the Library', { className: 'nx-action-btn-quiet nx-btn-sm', onClick: () => ctx.set({ tab: 'library' }) })));
}

function sourceBox(ctx) {
  const { source } = ctx.state;
  if (!source) {
    return el('section', { className: 'is-card' },
      el('h3', {}, 'Image to edit'),
      chooser(ctx, { onPick: ctx.editImage, as: 'source', title: 'On this page:' }));
  }
  return el('section', { className: 'is-card is-chosen' },
    thumb(ctx, source.key, ''),
    el('div', {},
      el('h3', {}, 'Editing'),
      el('p', { className: 'is-fine' }, source.name)),
    el('button', {
      type: 'button',
      className: 'nx-action-btn-icon',
      'aria-label': 'Pick a different image',
      title: 'Pick a different image',
      onClick: () => ctx.set({ source: null }),
    }, icon('close')));
}

function references(ctx) {
  const { refs, refsOpen: open } = ctx.state;
  return el('section', { className: 'is-refs' },
    el('div', { className: 'is-row is-row-between' },
      el('h3', {}, 'Reference images ', el('span', { className: 'is-fine' }, '(optional)')),
      refs.length < MAX_REFERENCES && iconButton('add', 'Add', {
        className: 'nx-action-btn-quiet nx-btn-sm',
        key: 'refs-add',
        'aria-expanded': String(Boolean(open)),
        onClick: () => ctx.set({ refsOpen: !open }),
      })),
    !refs.length && !open && el('p', { className: 'is-fine' }, 'Add a product shot to keep the real product in the picture.'),
    refs.length > 0 && el('ul', { className: 'is-strip' }, refs.map((r) => el('li', { className: 'is-ref' },
      thumb(ctx, r.key, r.name),
      el('button', {
        type: 'button', className: 'is-ref-x', 'aria-label': `Remove ${r.name}`, title: 'Remove', onClick: () => ctx.removeReference(r.key),
      }, icon('close'))))),
    open && chooser(ctx, {
      onPick: (i) => { ctx.addReference(i); ctx.set({ refsOpen: false }); }, as: 'ref', title: 'Pick from this page:',
    }));
}

/** Alt text for a saved image: written by Gemini, editable, or marked decorative (alt=""). */
function altField(ctx, v) {
  const id = `is-alt-${v.id}`;
  let hint = 'Google didn\'t write alt text. Describe the image, or mark it decorative.';
  if (v.decorative) hint = 'Inserted with empty alt text, so screen readers skip it. Use this only for images that add no information.';
  else if (v.alt) hint = 'Written by Gemini. Check it, and edit it if it isn\'t right.';
  return el('div', { className: 'is-field' },
    el('label', { className: 'is-label', for: id }, 'Alt text'),
    el('textarea', {
      id,
      rows: 2,
      maxlength: 250,
      className: 'nx-input is-alt-input',
      key: `alt-${v.id}`,
      value: v.decorative ? '' : (v.alt ?? ''),
      placeholder: v.decorative ? 'Decorative image' : 'Describe the image',
      disabled: !!v.decorative,
      'aria-describedby': `${id}-hint`,
      onInput: (e) => ctx.editAlt(v.id, e.target.value),
    }),
    el('p', { className: 'is-fine', id: `${id}-hint` }, hint),
    toggle({
      label: 'Decorative image (no alt text)', checked: !!v.decorative, key: `deco-${v.id}`, onChange: (on) => ctx.setDecorative(v.id, on),
    }));
}

function variantCard(ctx, v, index) {
  const key = `v:${v.id}`;
  if (v.status === 'pending') {
    return el('li', { className: 'is-variant pending' },
      el('span', { className: 'is-thumb is-skeleton' },
        el('span', { className: 'nx-loading-spinner', role: 'status', 'aria-label': `Generating option ${index + 1}` })));
  }
  const saved = v.status === 'saved';
  // Only the picture is draggable: the drag helper captures the pointer, which would swallow button clicks.
  const picture = el('span', { className: 'is-thumb' }, el('img', { src: ctx.thumbUrl(key), alt: v.alt || `Option ${index + 1}` }));
  const item = saved ? ctx.savedItem(v.id) : null; // reads the alt text as it is when used
  if (saved) ctx.draggable(picture, item);
  return el('li', { className: `is-variant${saved ? ' saved' : ''}` },
    picture,
    saved
      ? el('div', { className: 'is-variant-body' },
        el('p', { className: 'is-saved' }, icon('checkmarkcircle'), 'Saved to the site'),
        altField(ctx, v),
        placeActions(ctx, item))
      : el('div', { className: 'is-row' },
        el('button', {
          type: 'button', className: 'nx-btn-accent nx-btn-sm', key: `accept-${v.id}`, disabled: v.status === 'saving', onClick: () => ctx.accept(v.id),
        }, v.status === 'saving' ? 'Saving…' : 'Accept'),
        iconButton('brush', 'Edit this', { className: 'nx-action-btn-quiet nx-btn-sm', key: `refine-${v.id}`, onClick: () => ctx.refine(v.id) }),
        el('button', {
          type: 'button', className: 'nx-action-btn-icon is-push', key: `discard-${v.id}`, 'aria-label': 'Discard', title: 'Discard', onClick: () => ctx.discard(v.id),
        }, icon('delete'))));
}

/** Drag hint plus Insert / Replace for an image already saved in DA. */
export function placeActions(ctx, item) {
  const { caps } = ctx;
  return el('div', { className: 'is-row' },
    caps.insert && iconButton('imageadd', 'Insert', { className: 'nx-action-btn nx-btn-sm', key: `insert-${item.src}`, onClick: () => ctx.insert(item) }),
    caps.replace && iconButton('replace', 'Replace selected', {
      className: 'nx-action-btn nx-btn-sm', key: `replace-${item.src}`, title: 'Replace the image selected on the page', onClick: () => ctx.replaceSelected(item),
    }),
    ctx.addHandle(item),
    caps.drag && el('span', { className: 'is-fine', 'aria-hidden': 'true' }, 'Drag the picture onto an image to replace it, or Add between content.'));
}

export function createView(ctx) {
  const { state } = ctx;
  const edit = state.mode === 'edit';
  const generating = state.busy === 'Generating';
  const prompt = el('textarea', {
    id: 'is-prompt',
    key: 'prompt',
    className: 'nx-input is-textarea',
    rows: edit ? 3 : 5,
    placeholder: edit ? 'For example: autumn café background, warmer light' : 'Describe the image',
    onInput: (e) => { state.prompt = e.target.value; state.promptTouched = true; },
  });
  prompt.value = state.prompt;

  return el('div', { className: 'is-stack' },
    segmented({ label: 'What to make', items: MODES, value: state.mode, onChange: ctx.setMode, key: 'mode' }),
    edit && sourceBox(ctx),
    el('div', { className: 'is-field' },
      el('div', { className: 'is-row is-row-between' },
        el('label', { for: 'is-prompt' }, edit ? 'What should change?' : 'Describe the image'),
        !edit && state.promptTouched && el('button', {
          type: 'button',
          className: 'nx-action-btn-quiet nx-btn-sm',
          onClick: () => { ctx.set({ promptTouched: false }); ctx.setAspect(state.aspect); },
        }, 'Start again from the page')),
      prompt),
    references(ctx),
    el('div', { className: 'is-field' },
      el('span', { className: 'is-label' }, 'Shape'),
      segmented({
        label: 'Shape', items: ASPECTS.map((a) => ({ value: a.id, label: a.label })), value: state.aspect, onChange: ctx.setAspect, key: 'aspect',
      })),
    state.style && el('div', { className: 'is-field' },
      toggle({ label: 'Apply the site\'s brand style', checked: state.useStyle, onChange: (on) => ctx.set({ useStyle: on }), key: 'style' }),
      el('p', { className: 'is-fine' }, state.style)),
    state.models.length > 1 && el('div', { className: 'is-field' },
      el('span', { className: 'is-label' }, 'Model'),
      picker({
        label: 'Model', items: state.models.map((m) => ({ value: m.id, label: m.label })), value: state.model, onChange: ctx.setModel, key: 'model',
      })),
    el('button', {
      type: 'button', className: 'nx-btn-accent is-go', key: 'generate', disabled: Boolean(state.busy), onClick: ctx.generate,
    },
    generating ? el('span', { className: 'nx-loading-spinner', 'aria-hidden': 'true' }) : icon('aigenerate'),
    el('span', {}, generating ? 'Generating…' : `${edit ? 'Make' : 'Generate'} ${VARIANTS} ${edit ? 'edits' : 'images'}`)),
    state.variants.length > 0 && el('section', {},
      el('h3', {}, 'Results'),
      el('p', { className: 'is-fine' }, 'Only the images you accept are saved to the site.'),
      el('ul', { className: 'is-grid' }, state.variants.map((v, i) => variantCard(ctx, v, i)))));
}
