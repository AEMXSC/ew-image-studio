/**
 * Create tab: generate from the page or edit an image, with optional
 * reference images, then accept the variants worth keeping.
 */
import { ASPECTS, MAX_REFERENCES, VARIANTS } from './model.js';
import { el, icon, segmented } from './ui.js';

const MODES = [
  { id: 'generate', label: 'New image' },
  { id: 'edit', label: 'Edit an image' },
];

function thumb(ctx, key, alt = '') {
  return el('span', { className: `is-thumb${ctx.thumbFailed(key) ? ' broken' : ''}`, 'data-thumb-box': key },
    el('img', { src: ctx.thumbUrl(key) || undefined, 'data-thumb': key, alt }));
}

/** Upload button: a real file input, labelled for screen readers. */
function fromComputer(ctx, as, label) {
  const id = `is-file-${as}`;
  return el('label', { className: 'nx-action-btn nx-btn-sm is-file', for: id },
    label,
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
function picker(ctx, { onPick, as, title }) {
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
      el('button', { type: 'button', className: 'nx-action-btn nx-btn-sm', onClick: () => ctx.set({ tab: 'library' }) }, 'From the Library')));
}

function sourceBox(ctx) {
  const { source } = ctx.state;
  if (!source) {
    return el('section', { className: 'is-card' },
      el('h3', {}, 'Image to edit'),
      picker(ctx, { onPick: ctx.editImage, as: 'source', title: 'On this page:' }));
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
  const { refs } = ctx.state;
  const open = ctx.state.refsOpen;
  return el('section', { className: 'is-refs' },
    el('div', { className: 'is-row is-row-between' },
      el('h3', {}, 'Reference images ', el('span', { className: 'is-fine' }, '(optional)')),
      refs.length < MAX_REFERENCES && el('button', {
        type: 'button',
        className: 'nx-action-btn nx-btn-sm',
        key: 'refs-add',
        'aria-expanded': String(Boolean(open)),
        onClick: () => ctx.set({ refsOpen: !open }),
      }, icon('plus'), 'Add')),
    !refs.length && !open && el('p', { className: 'is-fine' }, 'Add a product shot to keep the real product in the picture.'),
    refs.length > 0 && el('ul', { className: 'is-strip' }, refs.map((r) => el('li', { className: 'is-ref' },
      thumb(ctx, r.key, r.name),
      el('button', {
        type: 'button', className: 'is-ref-x', 'aria-label': `Remove ${r.name}`, onClick: () => ctx.removeReference(r.key),
      }, icon('close'))))),
    open && picker(ctx, {
      onPick: (i) => { ctx.addReference(i); ctx.set({ refsOpen: false }); }, as: 'ref', title: 'Pick from this page:',
    }));
}

function variantCard(ctx, v) {
  const key = `v:${v.id}`;
  if (v.status === 'pending') {
    return el('li', { className: 'is-variant pending', 'aria-label': 'Generating' },
      el('span', { className: 'is-thumb is-skeleton' }));
  }
  const saved = v.status === 'saved';
  // Only the picture is draggable: the drag helper captures the pointer, which would swallow button clicks.
  const picture = el('span', { className: 'is-thumb' }, el('img', { src: ctx.thumbUrl(key), alt: v.alt || 'Generated image' }));
  if (saved) ctx.draggable(picture, { key: v.src, src: v.src, name: v.name });
  return el('li', { className: `is-variant${saved ? ' saved' : ''}` },
    picture,
    saved
      ? el('div', { className: 'is-variant-body' },
        el('p', { className: 'is-saved' }, icon('check'), 'Saved'),
        v.alt && el('p', { className: 'is-fine' }, `Alt text: ${v.alt}`),
        placeActions(ctx, { key: v.src, src: v.src, name: v.name, alt: v.alt }))
      : el('div', { className: 'is-row' },
        el('button', {
          type: 'button', className: 'nx-btn-accent nx-btn-sm', key: `accept-${v.id}`, disabled: v.status === 'saving', onClick: () => ctx.accept(v.id),
        }, v.status === 'saving' ? 'Saving…' : 'Accept'),
        el('button', { type: 'button', className: 'nx-action-btn nx-btn-sm', key: `refine-${v.id}`, onClick: () => ctx.refine(v.id) }, 'Edit this'),
        el('button', {
          type: 'button', className: 'nx-action-btn-icon', 'aria-label': 'Discard', title: 'Discard', onClick: () => ctx.discard(v.id),
        }, icon('close'))));
}

/** Insert / Replace buttons for an image already saved in DA. */
export function placeActions(ctx, item) {
  const { caps } = ctx;
  return el('div', { className: 'is-row' },
    caps.drag && el('span', { className: 'is-drag-hint' }, icon('drag'), 'Drag the picture'),
    caps.insert && el('button', { type: 'button', className: 'nx-action-btn nx-btn-sm', onClick: () => ctx.insert(item) }, 'Insert'),
    caps.replace && el('button', {
      type: 'button', className: 'nx-action-btn nx-btn-sm', title: 'Replace the image selected on the page', onClick: () => ctx.replaceSelected(item),
    }, 'Replace selected'));
}

export function createView(ctx) {
  const { state } = ctx;
  const edit = state.mode === 'edit';
  const busy = Boolean(state.busy);
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
    segmented({ label: 'What to make', options: MODES, value: state.mode, onChange: ctx.setMode, key: 'mode', disabled: busy }),
    edit && sourceBox(ctx),
    el('div', { className: 'is-field' },
      el('div', { className: 'is-row is-row-between' },
        el('label', { for: 'is-prompt' }, edit ? 'What should change?' : 'Describe the image'),
        !edit && state.promptTouched && el('button', {
          type: 'button', className: 'is-link', onClick: () => { ctx.set({ promptTouched: false }); ctx.setAspect(state.aspect); },
        }, 'Start again from the page')),
      prompt),
    references(ctx),
    el('div', { className: 'is-field' },
      el('span', { className: 'is-label', id: 'is-shape' }, 'Shape'),
      segmented({
        label: 'Shape', options: ASPECTS.map((a) => ({ id: a.id, label: a.label, title: a.id })), value: state.aspect, onChange: ctx.setAspect, key: 'aspect', disabled: busy,
      })),
    state.style && el('label', { className: 'is-check' },
      el('input', {
        type: 'checkbox', key: 'style', checked: state.useStyle || undefined, onChange: (e) => ctx.set({ useStyle: e.target.checked }),
      }),
      el('span', {}, 'Apply the site\'s brand style: ', el('span', { className: 'is-fine' }, state.style))),
    state.models.length > 1 && el('div', { className: 'is-field' },
      el('label', { for: 'is-model' }, 'Model'),
      el('select', { id: 'is-model', key: 'model', className: 'nx-input', onChange: (e) => ctx.setModel(e.target.value) },
        state.models.map((m) => el('option', { value: m.id, selected: m.id === state.model || undefined }, m.label)))),
    el('button', {
      type: 'button', className: 'nx-btn-accent is-go', key: 'generate', disabled: busy, onClick: ctx.generate,
    }, icon('sparkle'), busy && state.busy === 'Generating' ? 'Generating…' : `${edit ? 'Make' : 'Generate'} ${VARIANTS} ${edit ? 'edits' : 'images'}`),
    state.variants.length > 0 && el('section', {},
      el('h3', {}, 'Results'),
      el('p', { className: 'is-fine' }, 'Only the images you accept are saved to the site.'),
      el('ul', { className: 'is-grid' }, state.variants.map((v) => variantCard(ctx, v)))));
}
