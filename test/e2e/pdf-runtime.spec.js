import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('the bundled PDF runtime renders a local page without browser errors', async ({ page }) => {
  const fixture = await readFile(resolve('test/fixtures/one-page.pdf'));
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const rendered = await page.evaluate(async bytes => {
    const pdfjs = await import('/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
    });
    const pdfDocument = await task.promise;
    const firstPage = await pdfDocument.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    window.document.body.append(canvas);
    await firstPage.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
    }).promise;
    const pixels = canvas.getContext('2d').getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    ).data;
    const pages = pdfDocument.numPages;
    await task.destroy();
    return {
      pages,
      width: canvas.width,
      height: canvas.height,
      nonTransparentPixels: pixels.filter((_, index) => index % 4 === 3 && pixels[index] > 0).length,
    };
  }, [...fixture]);

  expect(rendered.pages).toBe(1);
  expect(rendered.width).toBeGreaterThan(0);
  expect(rendered.height).toBeGreaterThan(0);
  expect(rendered.nonTransparentPixels).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
