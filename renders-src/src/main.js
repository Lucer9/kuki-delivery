// Entry point: exposes window.KUKI.shot(job) to the Playwright driver.
import { DRAFT, aerial, hero } from './scene.js';
import { SLUGS } from './flavors.js';
import { boxOpen, boxClosed, patternSwatch } from './box.js';

window.KUKI = {
  slugs: SLUGS,
  async shot(job) {
    for (const f of ['700 100px "Bodoni Moda"', 'italic 500 100px "Bodoni Moda"', '500 100px "Bodoni Moda"']) await document.fonts.load(f);
    const s = DRAFT ? 0.5 : 1;
    const w = Math.round(job.w * s), h = Math.round(job.h * s);
    if (job.kind === 'aerial') return aerial(job.slug, w, h);
    if (job.kind === 'hero') return hero(job.slug, w, h, job.bg);
    if (job.kind === 'box-open') return boxOpen(w, h, job.bg);
    if (job.kind === 'box-closed') return boxClosed(w, h, job.bg);
    if (job.kind === 'pattern') return patternSwatch(w);
    throw new Error('unknown shot ' + job.kind);
  },
};
window.KUKI_READY = true;
