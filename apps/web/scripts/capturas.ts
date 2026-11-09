/**
 * Capturas do README (docs/img) com Playwright, no tema escuro.
 *
 * Pré-requisitos: api e web no ar, com um banco VAZIO (o GIF começa da lista sem casos) e a api
 * em modo demonstração (DEMO_REPLAY=true). Na primeira vez, baixe o navegador:
 *   pnpm --filter @reconcilia/web exec playwright install chromium
 * ou use um navegador já instalado com CAPTURE_CHANNEL=msedge (ou chrome).
 *
 *   pnpm --filter @reconcilia/web capturas
 *
 * Variáveis: WEB_URL (padrão http://localhost:3000), API_URL (padrão http://localhost:3001),
 * CAPTURE_CHANNEL (opcional) e CAPTURE_OUT (padrão docs/img na raiz do repositório).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import gifenc from 'gifenc';
import { type Browser, chromium, type Page } from 'playwright';
import pngjs from 'pngjs';

// gifenc e pngjs são CommonJS: no ESM do Node só o export default é garantido.
const { applyPalette, GIFEncoder, quantize } = gifenc;
const { PNG } = pngjs;

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:3001';
const OUT = resolve(process.env.CAPTURE_OUT ?? resolve(import.meta.dirname, '../../../docs/img'));
const OPERATOR = 'Ana';

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`${path} respondeu ${response.status}`);
  return (await response.json()) as T;
}

interface CaseRow {
  id: string;
  type: string;
  orderExternalId: string;
}

/** O GIF precisa começar sem casos: com dados, o "Gerar falhas" não conta a história. */
async function assertEmpty(): Promise<void> {
  const page = await api<{ pagination: { total: number } }>('/cases?limit=1');
  if (page.pagination.total > 0) {
    throw new Error('O banco da api já tem casos. Use um banco vazio para as capturas.');
  }
}

/** Grava quadros de 960×600 e monta o GIF no fim. */
class GifRecorder {
  private readonly frames: { png: Buffer; delay: number }[] = [];
  private readonly page: Page;

  // Sem "parameter property": o Node roda este arquivo só removendo os tipos.
  constructor(page: Page) {
    this.page = page;
  }

  async frame(delay: number): Promise<void> {
    this.frames.push({ png: await this.page.screenshot(), delay });
  }

  write(path: string): void {
    const gif = GIFEncoder();
    for (const { png, delay } of this.frames) {
      const { data, width, height } = PNG.sync.read(png);
      const rgba = new Uint8Array(data.buffer, data.byteOffset, data.length);
      const palette = quantize(rgba, 256);
      gif.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay });
    }
    gif.finish();
    writeFileSync(path, gif.bytes());
    console.log(`fluxo.gif: ${this.frames.length} quadros`);
  }
}

/** Gerar falhas → conciliar → abrir um caso → investigar → aprovar → resolvido. */
async function recordFlow(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const gif = new GifRecorder(page);

  await page.goto(`${WEB}/casos`);
  await page.getByText('Gerar falhas', { exact: true }).waitFor();
  await sleep(800);
  await gif.frame(1800);

  await page.getByRole('button', { name: 'Gerar falhas' }).click();
  await page.getByText(/Simulação \(seed/).waitFor({ timeout: 60_000 });
  await gif.frame(2200);
  await sleep(3_000); // o worker aplica as capturas

  await page.getByRole('button', { name: 'Conciliar agora' }).click();
  await page.getByText(/Conciliação: \d+ caso/).waitFor();
  await sleep(1_500); // contadores e lista recarregam
  await gif.frame(2600);

  const duplicate = (
    await api<{ data: CaseRow[] }>('/cases?type=DUPLICATE_WEBHOOK&status=OPEN&limit=1')
  ).data[0];
  if (!duplicate) throw new Error('Nenhum caso de webhook duplicado para o GIF');
  await page.getByRole('link', { name: duplicate.orderExternalId }).first().click();
  await page.getByRole('button', { name: 'Investigar' }).waitFor();
  await sleep(800);
  await gif.frame(2200);

  await page.getByRole('button', { name: 'Investigar' }).click();
  await gif.frame(900);
  await page.getByText('Ação sugerida').waitFor({ timeout: 60_000 });
  await page.getByText('Ação sugerida').scrollIntoViewIfNeeded();
  await sleep(500);
  await gif.frame(2800);

  await page.getByLabel('Nome de operador').fill(OPERATOR);
  await gif.frame(1200);
  await page.getByRole('button', { name: 'Aprovar' }).click();
  await page.getByText(/Aprovada por Ana e executada/).waitFor({ timeout: 30_000 });
  await sleep(500);
  await gif.frame(3200);

  gif.write(resolve(OUT, 'fluxo.gif'));
  await context.close();
}

async function screenshot(
  browser: Browser,
  file: string,
  path: string,
  options: { width: number; height: number; mobile?: boolean; fullPage?: boolean },
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: options.mobile ? 2 : 1,
    isMobile: options.mobile ?? false,
    hasTouch: options.mobile ?? false,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  // A sessão de operador já existe: o painel mostra "Decidindo como Ana", sem o campo vazio.
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    'reconcilia:operator',
    JSON.stringify(await operatorSession()),
  ] as const);
  const page = await context.newPage();
  await page.goto(`${WEB}${path}`);
  await page.waitForLoadState('networkidle');
  await sleep(800);
  await page.screenshot({ path: resolve(OUT, file), fullPage: options.fullPage ?? false });
  console.log(file);
  await context.close();
}

let session: unknown;
async function operatorSession(): Promise<unknown> {
  session ??= await api('/session', {
    method: 'POST',
    body: JSON.stringify({ operator: OPERATOR }),
  });
  return session;
}

/** Um caso investigado, com a ação aguardando aprovação, para a captura do detalhe. */
async function pendingCase(): Promise<CaseRow> {
  const candidate = (
    await api<{ data: CaseRow[] }>('/cases?type=CAPTURE_ON_CANCELED_ORDER&status=OPEN&limit=1')
  ).data[0];
  if (!candidate) throw new Error('Nenhum caso de captura em pedido cancelado aberto');
  const { investigationId } = await api<{ investigationId: string }>(
    `/cases/${candidate.id}/investigate`,
    { method: 'POST' },
  );
  for (let i = 0; i < 60; i++) {
    const investigation = await api<{ status: string }>(`/investigations/${investigationId}`);
    if (investigation.status === 'DONE') return candidate;
    if (investigation.status === 'FAILED') throw new Error('A investigação falhou');
    await sleep(500);
  }
  throw new Error('A investigação não terminou');
}

async function main(): Promise<void> {
  await assertEmpty();
  const browser = await chromium.launch({ channel: process.env.CAPTURE_CHANNEL });
  try {
    await recordFlow(browser);
    const detail = await pendingCase();
    await screenshot(browser, 'casos.png', '/casos', { width: 1280, height: 800 });
    await screenshot(browser, 'caso.png', `/casos/${detail.id}`, {
      width: 1280,
      height: 800,
      fullPage: true,
    });
    await screenshot(browser, 'saude.png', '/saude', { width: 1280, height: 800, fullPage: true });
    await screenshot(browser, 'caso-celular.png', `/casos/${detail.id}`, {
      width: 390,
      height: 844,
      mobile: true,
    });
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
