/**
 * Captures builder UI screenshots for a given resume id (resume_id / resume_code).
 * Uses split view (editor + RenderCV preview) unless overridden.
 * Run: BASE_URL=http://127.0.0.1:3000 node scripts/capture-builder-section-screenshots.cjs
 *
 * Env:
 *   RESUME_ID — UUID or id for ?id= (default: tailored resume for 92XRAZ)
 *   SCREENSHOT_LABEL — folder name under screenshots/ (default: 92XRAZ)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const RESUME_ID =
  process.env.RESUME_ID || 'afcc3eb4-fee6-424e-947f-6b2ef27c464f';
const SCREENSHOT_LABEL = process.env.SCREENSHOT_LABEL || '92XRAZ';
const ROOT = path.join(process.cwd(), 'screenshots', `builder-${SCREENSHOT_LABEL}`);

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function expandScrollablePanels(page) {
  await page.evaluate(() => {
    const selectors = [
      'div.h-full.min-h-0.overflow-y-auto',
      '.overflow-y-auto.overscroll-contain',
    ];
    const seen = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!(el instanceof HTMLElement) || seen.has(el)) return;
        seen.add(el);
        if (el.scrollHeight <= el.clientHeight + 2) return;
        el.dataset._cap = JSON.stringify({
          height: el.style.height,
          maxHeight: el.style.maxHeight,
          overflow: el.style.overflow,
          overflowY: el.style.overflowY,
        });
        el.style.height = `${el.scrollHeight}px`;
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
        el.style.overflowY = 'visible';
      });
    }
  });
}

async function restoreScrollablePanels(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-_cap]').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      try {
        const p = JSON.parse(el.dataset._cap);
        el.style.height = p.height || '';
        el.style.maxHeight = p.maxHeight || '';
        el.style.overflow = p.overflow || '';
        el.style.overflowY = p.overflowY || '';
        delete el.dataset._cap;
      } catch {
        /* ignore */
      }
    });
  });
}

async function shotFullPage(page, filePath) {
  await expandScrollablePanels(page);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
  } finally {
    await restoreScrollablePanels(page);
  }
}

async function gotoBuilder(page) {
  const url = `${BASE_URL.replace(/\/$/, '')}/builder?id=${encodeURIComponent(RESUME_ID)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('button:has-text("RESUME")', { timeout: 60_000 });
  await page.waitForTimeout(800);
}

/** Editor + preview (actual product representation for docs). */
async function ensureSplitView(page) {
  const split = page.getByRole('button', { name: 'Show split view' });
  if (await split.isVisible().catch(() => false)) {
    await split.click();
    await page.waitForTimeout(500);
  }
}

async function setRawYaml(page, on) {
  const sw = page.getByRole('switch', { name: 'Raw YAML' });
  await sw.waitFor({ state: 'visible', timeout: 15_000 });
  const checked = await sw.getAttribute('aria-checked');
  const isOn = checked === 'true';
  if (on && !isOn) await sw.click();
  if (!on && isOn) await sw.click();
  await page.waitForTimeout(300);
}

async function clickTopTab(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(400);
}

async function clickResumeSubtab(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(350);
}

async function clickNamedButton(page, label) {
  await page.getByRole('button', { name: label }).click();
  await page.waitForTimeout(250);
}

async function scrollCvSectionIntoView(page, label) {
  const el = page.getByText(label, { exact: false }).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
}

async function main() {
  mkdirp(ROOT);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1680, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await gotoBuilder(page);
  await ensureSplitView(page);
  await clickTopTab(page, 'RESUME');
  await page.waitForSelector('text=Resume Content', { timeout: 120_000 }).catch(() => {});
  await page.waitForSelector('img[alt="preview.png"]', { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shotFullPage(page, path.join(ROOT, '00-top-tabs-overview-resume.png'));

  // --- Resume / visual ---
  await setRawYaml(page, false);

  const visualBase = path.join(ROOT, '01-resume-visual');
  mkdirp(path.join(visualBase, 'cv'));
  mkdirp(path.join(visualBase, 'design'));
  mkdirp(path.join(visualBase, 'locale'));
  mkdirp(path.join(visualBase, 'settings'));
  mkdirp(path.join(visualBase, 'metadata'));

  await clickResumeSubtab(page, 'CV');
  const cvSections = [
    ['01-personal-info', 'Personal'],
    ['02-summary', 'Summary'],
    ['03-experience', 'Experience'],
    ['04-education', 'Education'],
    ['05-projects', 'Projects'],
    ['06-skills', 'Skills'],
  ];
  for (const [file, textHint] of cvSections) {
    try {
      await scrollCvSectionIntoView(page, textHint);
      await shotFullPage(page, path.join(visualBase, 'cv', `${file}.png`));
    } catch {
      await shotFullPage(page, path.join(visualBase, 'cv', `${file}.png`));
    }
  }
  await shotFullPage(page, path.join(visualBase, 'cv', '07-cv-full-expanded.png'));

  const designGroups = [
    'Core',
    'Page & Layout',
    'Header & Connections',
    'Typography',
    'Colors',
    'Sections & Entries',
    'Templates / Advanced',
  ];
  await clickResumeSubtab(page, 'Design');
  let d = 1;
  for (const g of designGroups) {
    await clickNamedButton(page, g);
    await shotFullPage(
      page,
      path.join(
        visualBase,
        'design',
        `${String(d).padStart(2, '0')}-${g.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
      )
    );
    d += 1;
  }

  const localeGroups = ['Basics', 'Phrases', 'Months'];
  await clickResumeSubtab(page, 'Locale');
  let l = 1;
  for (const g of localeGroups) {
    await clickNamedButton(page, g);
    await shotFullPage(
      page,
      path.join(visualBase, 'locale', `${String(l).padStart(2, '0')}-${g.toLowerCase()}.png`)
    );
    l += 1;
  }

  await clickResumeSubtab(page, 'Settings');
  await shotFullPage(page, path.join(visualBase, 'settings', '01-general.png'));

  await clickResumeSubtab(page, 'Metadata');
  await shotFullPage(page, path.join(visualBase, 'metadata', '01-metadata-panel.png'));

  // --- Raw YAML (same subtabs) ---
  const rawBase = path.join(ROOT, '02-resume-raw-yaml');
  for (const sub of ['cv', 'design', 'locale', 'settings', 'metadata']) {
    mkdirp(path.join(rawBase, sub));
  }

  await setRawYaml(page, true);

  const rawSections = ['CV', 'Design', 'Locale', 'Settings', 'Metadata'];
  const folderMap = {
    CV: 'cv',
    Design: 'design',
    Locale: 'locale',
    Settings: 'settings',
    Metadata: 'metadata',
  };
  for (const label of rawSections) {
    await clickResumeSubtab(page, label);
    await shotFullPage(page, path.join(rawBase, folderMap[label], '01-full.png'));
  }

  await setRawYaml(page, false);

  // --- CL & Outreach ---
  const lettersDir = path.join(ROOT, '03-cl-and-outreach');
  mkdirp(lettersDir);
  await clickTopTab(page, 'CL & OUTREACH');
  await shotFullPage(page, path.join(lettersDir, '01-workspace-full.png'));
  try {
    await page.getByText('Cover Letter', { exact: true }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shotFullPage(page, path.join(lettersDir, '02-cover-letter-editor.png'));
  } catch {
    /* ignore */
  }
  try {
    await page.getByText('Outreach Message', { exact: true }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shotFullPage(page, path.join(lettersDir, '03-outreach-editor.png'));
  } catch {
    /* ignore */
  }

  // --- JD Match (content only if tab enabled) ---
  const jdDir = path.join(ROOT, '04-jd-match');
  mkdirp(jdDir);
  await clickTopTab(page, 'RESUME');
  const jdBtn = page.getByRole('button', { name: 'JD MATCH', exact: true });
  const jdDisabled = await jdBtn.isDisabled();
  if (!jdDisabled) {
    await jdBtn.click();
    await page.waitForTimeout(400);
    await shotFullPage(page, path.join(jdDir, '01-jd-match-panel.png'));
  } else {
    await shotFullPage(page, path.join(jdDir, '01-jd-match-tab-disabled.png'));
  }

  // --- Additional questions ---
  const aqDir = path.join(ROOT, '05-additional-questions');
  mkdirp(aqDir);
  await clickTopTab(page, 'RESUME');
  const aqBtn = page.getByRole('button', { name: 'ADDITIONAL QUESTIONS', exact: true });
  const aqDisabled = await aqBtn.isDisabled();
  if (!aqDisabled) {
    await aqBtn.click();
    await page.waitForTimeout(500);
    await shotFullPage(page, path.join(aqDir, '01-additional-questions-panel.png'));
  } else {
    await shotFullPage(page, path.join(aqDir, '01-additional-questions-tab-disabled.png'));
  }

  await browser.close();
  console.log(`Done. Screenshots under ${ROOT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
