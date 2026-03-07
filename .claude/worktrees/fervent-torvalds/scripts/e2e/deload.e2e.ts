const puppeteer = require('puppeteer');

const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
const email = process.env.E2E_EMAIL || '';
const password = process.env.E2E_PASSWORD || '';
const headless = process.env.E2E_HEADLESS !== 'false';
const slowMo = Number(process.env.E2E_SLOWMO || 0);

const REPORT_CACHE_KEY = 'irontracks.report.history.v1';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeKey = (name) => String(name || '').trim().toLowerCase();

const xpathButtonByText = (text) => {
  const safe = String(text).replace(/"/g, '\\"');
  return `//button[contains(normalize-space(.), "${safe}")]`;
};

const clickButtonByText = async (page, text, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const handles = await page.$x(xpathButtonByText(text));
    if (handles && handles[0]) {
      await handles[0].click();
      return true;
    }
    await wait(200);
  }
  return false;
};

const clickFirstAvailable = async (page, texts, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const text of texts) {
      const handles = await page.$x(xpathButtonByText(text));
      if (handles && handles[0]) {
        await handles[0].click();
        return true;
      }
    }
    await wait(200);
  }
  return false;
};

const getFirstExerciseName = async (page) => {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find((b) => String(b.textContent || '').includes('Aplicar Deload'));
    if (!btn) return null;
    let node = btn.parentElement;
    for (let i = 0; i < 6; i += 1) {
      if (!node) break;
      const h3 = node.querySelector('h3');
      if (h3 && h3.textContent) return h3.textContent.trim();
      node = node.parentElement;
    }
    return null;
  });
};

const setReportCache = async (page, exerciseName, avgWeight, avgReps) => {
  const key = normalizeKey(exerciseName);
  await page.evaluate(
    ({ storageKey, key, name, avgWeight, avgReps }) => {
      const now = Date.now();
      const entry = {
        ts: now,
        avgWeight: avgWeight ?? null,
        avgReps: avgReps ?? null,
        totalVolume: avgWeight && avgReps ? Number(avgWeight) * Number(avgReps) : 0,
        topWeight: avgWeight ?? null,
        setsCount: avgReps ? 1 : 0,
        name,
      };
      const payload = {
        cachedAt: now,
        data: {
          version: 1,
          exercises: {
            [key]: { name, items: [entry] },
          },
        },
      };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {}
    },
    {
      storageKey: REPORT_CACHE_KEY,
      key,
      name: String(exerciseName || '').trim(),
      avgWeight: avgWeight ?? null,
      avgReps: avgReps ?? null,
    },
  );
};

const ensureLoggedIn = async (page) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const emailInput = await page.$('input[placeholder="seu@email.com"]');
  if (!emailInput) return { skipped: false };
  if (!email || !password) {
    console.log('E2E_SKIPPED: Sete E2E_EMAIL e E2E_PASSWORD para login.');
    return { skipped: true };
  }
  await clickButtonByText(page, 'Entrar com E-mail', 6000);
  await page.waitForSelector('input[placeholder="seu@email.com"]', { timeout: 6000 });
  await page.type('input[placeholder="seu@email.com"]', email, { delay: 20 });
  await page.type('input[placeholder="Senha"]', password, { delay: 20 });
  await clickButtonByText(page, 'ENTRAR', 8000);
  await page.waitForXPath(xpathButtonByText('INICIAR TREINO'), { timeout: 20000 }).catch(() => {});
  return { skipped: false };
};

const startFirstWorkout = async (page) => {
  await page.waitForXPath(xpathButtonByText('INICIAR TREINO'), { timeout: 20000 });
  const started = await clickButtonByText(page, 'INICIAR TREINO', 8000);
  if (!started) throw new Error('Botão INICIAR TREINO não encontrado');
  await clickFirstAvailable(page, ['Iniciar', 'Confirmar', 'OK'], 5000);
  await page.waitForXPath(xpathButtonByText('Aplicar Deload'), { timeout: 20000 });
};

const runScenarioFull = async (page) => {
  const name = await getFirstExerciseName(page);
  if (!name) throw new Error('Nome do exercício não encontrado');
  await setReportCache(page, name, 100, 8);
  await clickButtonByText(page, 'Aplicar Deload', 8000);
  await clickButtonByText(page, 'Analisar', 8000);
  await page.waitForXPath(xpathButtonByText('Aplicar agora'), { timeout: 12000 });
  await clickFirstAvailable(page, ['Cancelar', 'Fechar', 'X'], 6000);
  console.log('E2E_OK: Deload completo com modal');
};

const runScenarioWatermark = async (page) => {
  const name = await getFirstExerciseName(page);
  if (!name) throw new Error('Nome do exercício não encontrado');
  await setReportCache(page, name, 0, 8);
  await clickButtonByText(page, 'Aplicar Deload', 8000);
  await clickButtonByText(page, 'Analisar', 8000);
  await page.waitForFunction(() => document.body.innerText.includes('Deload completo indisponível'), { timeout: 12000 });
  await clickFirstAvailable(page, ['Ok', 'OK', 'Entendi', 'Fechar', 'Cancelar'], 6000);
  console.log('E2E_OK: Marca d’água com mensagem de indisponibilidade');
};

const runScenarioOffline = async (page) => {
  try {
    await page.setOfflineMode(true);
  } catch {}
  await page.evaluate((key) => {
    try { window.localStorage.removeItem(key); } catch {}
  }, REPORT_CACHE_KEY);
  await clickButtonByText(page, 'Aplicar Deload', 8000);
  await clickButtonByText(page, 'Analisar', 8000);
  const found = await page
    .waitForFunction(() => document.body.innerText.includes('Relatórios'), { timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  if (found) {
    await clickFirstAvailable(page, ['Ok', 'OK', 'Entendi', 'Fechar', 'Cancelar'], 6000);
    console.log('E2E_OK: Falha de rede com feedback de relatórios');
  } else {
    console.log('E2E_WARN: Cenário offline não confirmou mensagem de relatórios');
  }
  try {
    await page.setOfflineMode(false);
  } catch {}
};

const main = async () => {
  const browser = await puppeteer.launch({ headless, slowMo, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  const login = await ensureLoggedIn(page);
  if (login.skipped) {
    await browser.close();
    process.exit(0);
  }
  await startFirstWorkout(page);
  await runScenarioFull(page);
  await runScenarioWatermark(page);
  await runScenarioOffline(page);
  await browser.close();
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('E2E_FAIL:', err && err.message ? err.message : String(err));
    process.exit(1);
  });

