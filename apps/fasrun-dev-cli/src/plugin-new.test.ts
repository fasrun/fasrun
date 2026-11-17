// fasrun plugin new (SF-1 T010, D-6), run as a process against a minimal workspace.
// TC-PLATFORM-018 — R-platform-006.S1: a backend plugin is generated with four layers and migrations/ and registered.
// TC-PLATFORM-019 — R-platform-006.S2: an invalid role writes nothing and lists the valid roles.
// TC-PLATFORM-020 — R-platform-006.S3: an existing package is not overwritten.
// TC-PLATFORM-067 — R-platform-006.S4: the generated packages equal the version-controlled fixtures under
// test/fixtures/plugin-new/ (SF-1 T021). The committed capability plugins evolve with their tasks and are only
// checked for host registration.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Each test starts several CLI processes; CI runs many suites in parallel, so allow more than the default 5 s.
vi.setConfig({ testTimeout: 30_000 });

const BIN = fileURLToPath(new URL('../bin/run.js', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const FIXTURES = fileURLToPath(new URL('../test/fixtures/plugin-new', import.meta.url));

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A workspace with the two hosts' plugin lists, package.json and tsconfig, copied from this repository. */
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'fasrun-plugin-new-'));
  dirs.push(root);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - plugins/*/*\n');
  writeFileSync(join(root, 'tsconfig.json'), '{\n  "files": [],\n  "references": []\n}\n');
  for (const host of ['fasrun-core-svc', 'fasrun-connect-svc']) {
    mkdirSync(join(root, 'apps', host, 'src'), { recursive: true });
    cpSync(join(REPO, 'apps', host, 'package.json'), join(root, 'apps', host, 'package.json'));
    cpSync(join(REPO, 'apps', host, 'tsconfig.json'), join(root, 'apps', host, 'tsconfig.json'));
    // fasrun-node-svc registers no plugins yet, so its list shows the empty marker blocks.
    cpSync(join(REPO, 'apps/fasrun-node-svc/src/plugins.ts'), join(root, 'apps', host, 'src', 'plugins.ts'));
  }
  return root;
}

function cli(args: string[], cwd: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.stdin.end();
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const snapshot = (root: string) =>
  execFileSync('find', ['.', '-type', 'f'], { cwd: root, encoding: 'utf8' }).split('\n').sort();

describe('fasrun plugin new (R-platform-006)', () => {
  it('TC-PLATFORM-018 generates a backend plugin with four layers and migrations/ and registers it in fasrun-core-svc', async () => {
    const root = workspace();
    const run = await cli(['plugin', 'new', 'demo', '--role', 'backend', '--json'], root);
    expect(run.code).toBe(0);
    const pkg = join(root, 'plugins/demo/demo-backend');
    for (const dir of ['src/starter', 'src/application', 'src/infrastructure', 'src/common', 'migrations']) {
      expect(existsSync(join(pkg, dir)), dir).toBe(true);
    }
    const hostList = readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8');
    // The fixture has no Prettier configuration, so quotes follow Prettier's defaults.
    expect(hostList).toMatch(/import demoPlugin from ["']@fasrun\/plugin-demo-backend["'];/);
    expect(hostList).toMatch(/fasrun:plugin-list:begin\s+demoPlugin,\s+\/\/ fasrun:plugin-list:end/);
    const hostManifest = JSON.parse(readFileSync(join(root, 'apps/fasrun-core-svc/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(hostManifest.dependencies['@fasrun/plugin-demo-backend']).toBe('workspace:*');
    expect(readFileSync(join(root, 'apps/fasrun-core-svc/tsconfig.json'), 'utf8')).toContain(
      '../../plugins/demo/demo-backend',
    );
    expect(readFileSync(join(root, 'tsconfig.json'), 'utf8')).toContain('plugins/demo/demo-backend');
    expect(readFileSync(join(root, 'apps/fasrun-connect-svc/src/plugins.ts'), 'utf8')).not.toContain('demo');
    expect(JSON.parse(run.stdout)).toMatchObject({
      ok: true,
      result: { package: '@fasrun/plugin-demo-backend', nextSteps: ['pnpm install'] },
    });
  }, 30_000);

  it('TC-PLATFORM-019 an invalid role exits with 2, lists the valid roles and writes nothing', async () => {
    const root = workspace();
    const before = snapshot(root);
    const run = await cli(['plugin', 'new', 'demo', '--role', 'server'], root);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('common, node, react, backend, backend-module-<name>, web, web-module-<name>');
    expect(snapshot(root)).toEqual(before);
  });

  it('TC-PLATFORM-020 an existing package is refused and left unchanged', async () => {
    const root = workspace();
    expect((await cli(['plugin', 'new', 'demo', '--role', 'backend'], root)).code).toBe(0);
    const marker = join(root, 'plugins/demo/demo-backend/src/index.ts');
    writeFileSync(marker, '// edited by hand\n');
    const hostList = readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8');
    const again = await cli(['plugin', 'new', 'demo', '--role', 'backend'], root);
    expect(again.code).toBe(2);
    expect(again.stderr).toContain('already exists');
    expect(readFileSync(marker, 'utf8')).toBe('// edited by hand\n');
    expect(readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8')).toBe(hostList);
  }, 30_000);

  it('registers connect in fasrun-connect-svc, honours --host, and keeps non-backend roles out of the hosts', async () => {
    const root = workspace();
    expect((await cli(['plugin', 'new', 'connect', '--role', 'backend'], root)).code).toBe(0);
    expect(readFileSync(join(root, 'apps/fasrun-connect-svc/src/plugins.ts'), 'utf8')).toContain('connectPlugin,');
    expect((await cli(['plugin', 'new', 'relay', '--role', 'backend', '--host', 'connect'], root)).code).toBe(0);
    expect(readFileSync(join(root, 'apps/fasrun-connect-svc/src/plugins.ts'), 'utf8')).toContain('relayPlugin,');
    const core = readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8');
    expect((await cli(['plugin', 'new', 'relay', '--role', 'common'], root)).code).toBe(0);
    expect(readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8')).toBe(core);
    expect((await cli(['plugin', 'new', 'Bad_Name', '--role', 'common'], root)).code).toBe(2);
  }, 30_000);
});

/** Relative paths of all files under `dir`, sorted. */
function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

/** Differences between a generated package and its fixture: missing, extra and changed files. */
function differences(generated: string, fixture: string): string[] {
  const actual = files(generated);
  const expected = files(fixture);
  return [
    ...expected.filter((path) => !actual.includes(path)).map((path) => `missing ${path}`),
    ...actual.filter((path) => !expected.includes(path)).map((path) => `extra ${path}`),
    ...expected
      .filter((path) => actual.includes(path))
      .filter((path) => readFileSync(join(generated, path), 'utf8') !== readFileSync(join(fixture, path), 'utf8'))
      .map((path) => `changed ${path}`),
  ];
}

describe('scaffold output against independent fixtures (R-platform-006.S4)', () => {
  it('TC-PLATFORM-067 backend and common packages equal the fixtures, and a change on either side is detected', async () => {
    for (const role of ['backend', 'common']) {
      const root = workspace();
      expect((await cli(['plugin', 'new', 'demo', '--role', role], root)).code).toBe(0);
      const generated = join(root, `plugins/demo/demo-${role}`);
      const fixture = join(FIXTURES, role);
      expect(differences(generated, fixture), role).toEqual([]);

      // A changed or extra generated file fails the comparison.
      const [first] = files(generated);
      if (first === undefined) throw new Error(`no files generated for ${role}`);
      writeFileSync(join(generated, first), `${readFileSync(join(generated, first), 'utf8')}\n// changed\n`);
      writeFileSync(join(generated, 'extra.ts'), 'export {};\n');
      expect(differences(generated, fixture)).toEqual(['extra extra.ts', `changed ${first}`]);

      // A changed or missing fixture file fails it as well.
      const copy = mkdtempSync(join(tmpdir(), 'fasrun-fixture-'));
      dirs.push(copy);
      cpSync(fixture, copy, { recursive: true });
      rmSync(join(copy, first));
      const fresh = workspace();
      expect((await cli(['plugin', 'new', 'demo', '--role', role], fresh)).code).toBe(0);
      expect(differences(join(fresh, `plugins/demo/demo-${role}`), copy)).toEqual([`extra ${first}`]);
    }
  }, 60_000);
});

const CAPABILITIES = [
  'entry',
  'identity',
  'spec',
  'knowledge',
  'orchestration',
  'environment',
  'governance',
  'insight',
  'connect',
];

describe('the nine capability plugins (R-platform-006)', () => {
  it('exist as -common and -backend packages and are registered in their hosts', () => {
    for (const plugin of CAPABILITIES) {
      for (const role of ['common', 'backend']) {
        const manifest = JSON.parse(
          readFileSync(join(REPO, `plugins/${plugin}/${plugin}-${role}/package.json`), 'utf8'),
        ) as { name: string };
        expect(manifest.name).toBe(`@fasrun/plugin-${plugin}-${role}`);
      }
    }
    const core = readFileSync(join(REPO, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8');
    const connect = readFileSync(join(REPO, 'apps/fasrun-connect-svc/src/plugins.ts'), 'utf8');
    for (const plugin of CAPABILITIES.filter((p) => p !== 'connect'))
      expect(core, plugin).toContain(`${plugin}Plugin,`);
    expect(connect).toContain('connectPlugin,');
    expect(core).not.toContain('connectPlugin');
  });
});
