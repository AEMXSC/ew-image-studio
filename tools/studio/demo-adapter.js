/**
 * Demo mode (?demo=1): sample Fréscopa images made with Nano Banana, served
 * from this repository. Same methods as the Gemini adapter and the DA layer,
 * so the panel runs unchanged; nothing is sent to Google or saved.
 */
import { blobToBase64 } from './images.js';

const asset = (name) => new URL(`./demo/${name}`, import.meta.url).href;
const DELAY = 1400;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const NEW = ['hero-1.jpg', 'hero-2.jpg', 'hero-3.jpg'];
const EDITS = ['edit-1.jpg', 'edit-2.jpg', 'edit-3.jpg'];
const ALT = {
  'hero-1.jpg': 'A bag of Fréscopa Autumn House Blend beside a mug of coffee, hazelnuts and sliced apple on a wooden café table',
  'edit-1.jpg': 'A café counter in warm autumn evening light, with a bag of Fréscopa coffee and orange leaves on the counter',
  'bag.jpg': 'A kraft-paper bag of Fréscopa Autumn House Blend coffee on a plain grey background',
  'cafe.jpg': 'A bright café counter with an espresso machine, plants and pastries under glass',
};

export const DEMO_PAGE = `<main><div>
  <h1>Autumn house blend</h1>
  <p>Our autumn house blend is back: a medium roast with notes of caramel, toasted hazelnut and baked apple, made for slow mornings as the leaves turn.</p>
  <p>Find it in every Fréscopa café and online from 1 October, while the harvest lasts.</p>
  <p><img src="${asset('cafe.jpg')}" alt="A Fréscopa café counter in the morning"></p>
</div></main>`;

async function load(name) {
  const resp = await fetch(asset(name));
  return resp.blob();
}

export function createDemoModel() {
  let n = 0;
  return {
    async models() {
      return [{ id: 'demo-nano-banana', label: 'Nano Banana (demo images)' }];
    },
    async generate({ images = [], prompt = '' }) {
      await wait(DELAY + Math.random() * 800);
      const editing = images.length && prompt.startsWith('Edit the first image');
      const list = editing ? EDITS : NEW;
      const name = list[n % list.length];
      n += 1;
      return { mime: 'image/jpeg', data: await blobToBase64(await load(name)) };
    },
    async describe() {
      await wait(400);
      return ALT['hero-1.jpg'];
    },
  };
}

export function createDemoDa() {
  const items = ['bag.jpg', 'cafe.jpg', 'hero-1.jpg', 'edit-1.jpg'].map((name, i) => ({
    path: `/media/studio/${name}`, name, modified: Date.now() - i * 3600000, src: asset(name), alt: ALT[name] ?? '',
  }));
  return {
    org: 'demo',
    site: 'frescopa',
    async list(folder) {
      return folder === '/media/studio' ? { items, folders: [] } : { items: [], folders: [{ path: '/media/studio', name: 'studio' }] };
    },
    async save(path) { await wait(500); return `demo://saved${path}`; }, // kept in this tab only
    async image(src) { return (await fetch(src)).blob(); },
    async pageHtml() { return DEMO_PAGE; },
    async style() { return 'Warm, natural light; muted autumn colours; real cafés, not studio sets.'; },
  };
}
