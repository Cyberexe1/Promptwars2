import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Drift guard for everything the frontend and backend must agree on.
 *
 * The two projects are separate packages and the backend deploys from a
 * container that copies only its own directory, so a shared module is not an
 * option without restructuring the build. Until now the agreement was kept by
 * hand: API types were declared twice, and a handful of constants (password
 * length, CSRF names, AQI band edges, the outdoor-minutes cap, the freshness
 * window) were copied across. Nothing failed if one side changed.
 *
 * This reads the frontend source as text and compares it with the backend's.
 * Crude, and deliberately so: it needs no build step and no generated code,
 * and it fails with a message naming the thing that drifted.
 *
 * It lives in the backend because the backend config has Node types and the
 * frontend's deliberately does not, since everything under frontend/src is
 * browser code. Every pipeline checks out the whole repository, and the
 * container image never runs tests, so reaching across to ../frontend is safe.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

function backend(path: string): string {
  return readFileSync(resolve(HERE, '../src', path), 'utf8');
}

function frontend(path: string): string {
  return readFileSync(resolve(HERE, '../../frontend/src', path), 'utf8');
}

/** Strips comments and whitespace, so only the declarations are compared. */
function normalise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '')
    .replace(/;/g, '');
}

function declarations(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /export (?:interface|type) (\w+)/g;
  const starts: { name: string; at: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    starts.push({ name: match[1]!, at: match.index });
  }
  starts.forEach((entry, index) => {
    const end = starts[index + 1]?.at ?? source.length;
    found.set(entry.name, normalise(source.slice(entry.at, end)));
  });
  return found;
}

describe('API types match between frontend and backend', () => {
  const backendTypes = declarations(backend('types.ts'));
  const frontendTypes = declarations(frontend('types.ts'));

  it('declares the same set of types', () => {
    expect([...frontendTypes.keys()].sort()).toEqual([...backendTypes.keys()].sort());
  });

  it.each([...backendTypes.keys()])('declares %s identically', (name) => {
    expect(
      frontendTypes.get(name),
      `${name} differs between backend/src/types.ts and frontend/src/types.ts`,
    ).toBe(backendTypes.get(name));
  });
});

describe('client-side routes are published for direct loads', () => {
  // The distribution serves a copy of the app shell at each route path,
  // because it can no longer map 403 to /index.html: that mapping applies to
  // every cache behaviour, so once the API joined the distribution it turned
  // the API's own 403 and 404 responses into 200s carrying HTML. A route
  // missing from the list works through in-app navigation and fails on a
  // refresh or a shared link, which is exactly the kind of fault nobody sees
  // until a user hits it.
  const published = readFileSync(resolve(HERE, '../../infrastructure/spa-routes.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();

  const declared = [...frontend('App.tsx').matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((match) => match[1]!)
    // The root is index.html itself, and the wildcard is the not-found route.
    .filter((path) => path !== '/' && path !== '*')
    .map((path) => path.replace(/^\//, ''))
    .sort();

  it('finds the routes it is meant to compare', () => {
    expect(declared.length).toBeGreaterThan(0);
  });

  it('publishes a shell for every route App.tsx declares', () => {
    expect(published).toEqual(declared);
  });

  it('lists only top-level routes, which is all the publisher handles', () => {
    for (const route of published) {
      expect(route, `${route} is nested, so it would need a directory key`).not.toContain('/');
    }
  });
});

describe('shared constants match', () => {
  it('requires the same minimum password length', () => {
    const server = /MIN_PASSWORD_LENGTH\s*=\s*(\d+)/.exec(backend('services/password.ts'));
    const client = /MIN_PASSWORD_LENGTH\s*=\s*(\d+)/.exec(frontend('routes/LoginPage.tsx'));

    expect(server, 'server constant not found').not.toBeNull();
    expect(client, 'client constant not found').not.toBeNull();
    expect(client![1]).toBe(server![1]);
  });

  it('uses the same CSRF cookie and header names', () => {
    const server = backend('middleware/csrf.ts');
    const client = frontend('api.ts');

    const cookie = /CSRF_COOKIE\s*=\s*'([^']+)'/.exec(server)![1]!;
    const header = /CSRF_HEADER\s*=\s*'([^']+)'/.exec(server)![1]!;

    expect(client).toContain(`'${cookie}'`);
    expect(client).toContain(`'${header}'`);
  });

  it('draws the AQI band edges in the same places', () => {
    const server = [...backend('domain/aqi.ts').matchAll(/aqiHigh:\s*(\d+)/g)]
      .map((m) => Number(m[1]))
      .slice(0, 5);
    const client = [...frontend('bands.ts').matchAll(/limit:\s*(\d+)/g)].map((m) =>
      Number(m[1]),
    );

    expect(server).toHaveLength(5);
    // The forecast chart colours bars with the client table and the headline
    // reading uses the server's. If these differ, one page shows two bands.
    expect(client).toEqual(server);
  });

  it('caps daily outdoor minutes at the same number', () => {
    const server = Number(
      /outdoorMinutes[^\n]*?\.max\((\d+)\)/s.exec(backend('schemas.ts'))?.[1],
    );

    expect(server).toBeGreaterThan(0);
    for (const file of ['components/ProfileForm.tsx', 'routes/DashboardPage.tsx']) {
      expect(
        frontend(file),
        `${file} should use the server's cap of ${server}`,
      ).toContain(String(server));
    }
  });

  it('describes the freshness window the server enforces', () => {
    const ms = /FRESHNESS_WINDOW_MS\s*=\s*([\d\s*]+)/.exec(
      backend('services/airQuality.ts'),
    )![1]!;
    const hours =
      ms
        .split('*')
        .map((part) => Number(part.trim()))
        .reduce((product, value) => product * value, 1) / 3_600_000;

    expect(hours).toBe(3);
    // The interface says "three hours" in prose. If the constant moves, the
    // wording has to move with it, or the page states something untrue.
    expect(frontend('components/AirQualityPanel.tsx')).toMatch(/three hours/i);
    expect(frontend('components/RecommendationList.tsx')).toMatch(/three hours/i);
  });
});
