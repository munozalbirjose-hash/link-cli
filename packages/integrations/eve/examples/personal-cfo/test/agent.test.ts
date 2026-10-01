import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const eveRoot = fileURLToPath(new URL('../../', import.meta.resolve('eve')));

it('exposes only read-only financial tools and the sample skills', async () => {
  // Use Eve's real discovery without invoking a model or Link's API.
  const { stdout } = await exec(
    process.execPath,
    [join(eveRoot, 'bin/eve.js'), 'info', '--json'],
    {
      cwd: appRoot,
      timeout: 25_000,
    },
  );
  const info = JSON.parse(stdout);
  const diagnostics = await readFile(info.artifacts.diagnostics, 'utf8');
  expect(info.status, diagnostics).toBe('ready');
  expect(info.diagnostics.errors).toBe(0);

  expect([...info.tools].sort()).toEqual([
    'link__list_balances',
    'link__list_sources',
    'link__list_transactions',
    'load_skill',
  ]);
  expect([...info.skills].sort()).toEqual([
    'link__create-payment-credential',
    'link__financial-insights',
    'monthly-review',
  ]);

  const manifest = JSON.parse(
    await readFile(info.artifacts.compiledManifest, 'utf8'),
  );
  const skill = (name: string) =>
    manifest.skills.find((entry: { name: string }) => entry.name === name);
  expect(skill('link__create-payment-credential').markdown).toContain(
    'This personal CFO is read-only.',
  );
  expect(skill('monthly-review').markdown).toContain('# Monthly review');
}, 30_000);
