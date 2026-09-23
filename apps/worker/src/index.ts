import fallbackStarlink from './fallback-starlink.json';

interface Env { ALLOWED_ORIGIN?: string }
type OmmRecord = Record<string, string | number | null>;
type CachedPayload = { fetchedAt: number; source: string; satellites: OmmRecord[] };

const SOURCES = [
  'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?SOURCE=SpaceX-E&FORMAT=JSON',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=STARLINK&FORMAT=JSON',
];
const REFRESH_MS = 2 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const CACHE_KEY = new Request('https://leo-link-lab.internal/cache/starlink');
const FALLBACK_FETCHED_AT = Date.now();
const GEOCODE_TTL_SECONDS = 30 * 24 * 60 * 60;
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const ESRI_IMAGERY = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const ESRI_LABELS = 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile';
const IMAGERY_CACHE_SECONDS = 7 * 24 * 60 * 60;
const ACTIVE_SOURCE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=JSON';
const ACTIVE_CACHE_KEY = new Request('https://leo-link-lab.internal/cache/active-satellites');

function cors(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function fetchSource(url: string): Promise<OmmRecord[]> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'leo-link-lab/0.1 educational-project' },
  });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  const data = await response.json<OmmRecord[]>();
  if (!Array.isArray(data) || data.length === 0) throw new Error('CelesTrak returned an empty dataset');
  return data;
}

async function refreshCache() {
  const cache = caches.default;
  for (const source of SOURCES) {
    try {
      const satellites = await fetchSource(source);
      const payload: CachedPayload = { fetchedAt: Date.now(), source, satellites };
      await cache.put(CACHE_KEY, Response.json(payload, {
        headers: { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
      }));
      return;
    } catch {
      // Try the next official CelesTrak source. Keep serving the existing cache/snapshot.
    }
  }
}

async function getImmediateData(ctx: ExecutionContext): Promise<CachedPayload & { stale: boolean }> {
  const cachedResponse = await caches.default.match(CACHE_KEY);
  if (cachedResponse) {
    const cached = await cachedResponse.json<CachedPayload>();
    const stale = Date.now() - cached.fetchedAt >= REFRESH_MS;
    if (stale) ctx.waitUntil(refreshCache());
    return { ...cached, stale };
  }

  ctx.waitUntil(refreshCache());
  return {
    fetchedAt: FALLBACK_FETCHED_AT,
    source: 'bundled-fallback',
    satellites: fallbackStarlink as OmmRecord[],
    stale: true,
  };
}

async function getActiveCatalogResponse() {
  const cached = await caches.default.match(ACTIVE_CACHE_KEY);
  if (cached) return cached;

  const response = await fetch(ACTIVE_SOURCE, {
    signal: AbortSignal.timeout(25000),
    headers: { 'User-Agent': 'leo-link-lab/0.1 educational-project' },
  });
  if (!response.ok) throw new Error(`CelesTrak active catalog returned HTTP ${response.status}`);

  const result = new Response(response.body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${Math.round(REFRESH_MS / 1000)}`,
    },
  });
  await caches.default.put(ACTIVE_CACHE_KEY, result.clone());
  return result;
}

function sampleEvenly<T>(items: T[], limit: number) {
  if (items.length <= limit) return items;
  const stride = items.length / limit;
  return Array.from({ length: limit }, (_, i) => items[Math.floor(i * stride)]);
}

async function proxyRasterTile(baseUrl: string, cacheNamespace: string, z: number, x: number, y: number) {
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 18 || x < 0 || y < 0) {
    return new Response('Invalid tile coordinates', { status: 400 });
  }

  const tileUrl = `${baseUrl}/${z}/${y}/${x}`;
  const cacheKey = new Request(`https://leo-link-lab.internal/cache/${cacheNamespace}/${z}/${x}/${y}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const response = await fetch(tileUrl, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'LEO-Link-Lab/1.0 satellite-education-map' },
  });
  if (!response.ok) return new Response('Raster upstream error', { status: response.status });

  const result = new Response(response.body, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'image/png',
      'Cache-Control': `public, max-age=${IMAGERY_CACHE_SECONDS}`,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });

  await caches.default.put(cacheKey, result.clone());
  return result;
}

async function imageryTile(z: number, x: number, y: number) {
  return proxyRasterTile(ESRI_IMAGERY, 'imagery', z, x, y);
}

async function labelTile(z: number, x: number, y: number) {
  return proxyRasterTile(ESRI_LABELS, 'labels', z, x, y);
}
async function geocode(query: string) {
  const normalized = query.trim().replace(/\s+/g, ' ');
  const cacheKey = new Request(`https://leo-link-lab.internal/cache/geocode?q=${encodeURIComponent(normalized.toLowerCase())}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const target = new URL(NOMINATIM);
  target.searchParams.set('q', normalized);
  target.searchParams.set('format', 'jsonv2');
  target.searchParams.set('limit', '5');

  const response = await fetch(target.toString(), {
    signal: AbortSignal.timeout(8000),
    headers: {
      'User-Agent': 'LEO-Link-Lab/1.0 (+https://leo-link-lab.719919153.workers.dev)',
      'Referer': 'https://leo-link-lab.719919153.workers.dev/',
      'Accept-Language': 'en',
    },
  });
  if (!response.ok) throw new Error(`Geocoder returned HTTP ${response.status}`);

  const data = await response.json<Array<{ display_name: string; lat: string; lon: string }>>();
  const results = data.map(item => ({
    label: item.display_name,
    latDeg: Number(item.lat),
    lonDeg: Number(item.lon),
  })).filter(item => Number.isFinite(item.latDeg) && Number.isFinite(item.lonDeg));

  const result = Response.json({ results }, {
    headers: { 'Cache-Control': `public, max-age=${GEOCODE_TTL_SECONDS}` },
  });
  await caches.default.put(cacheKey, result.clone());
  return result;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const headers = cors(env);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname === '/health') return Response.json({ ok: true }, { headers });

    const imageryMatch = url.pathname.match(/^\/api\/imagery\/(\d+)\/(\d+)\/(\d+)$/);
    if (imageryMatch) {
      const [, z, x, y] = imageryMatch;
      const response = await imageryTile(Number(z), Number(x), Number(y));
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        headers: {
          ...headers,
          'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
          'Cache-Control': response.headers.get('Cache-Control') || `public, max-age=${IMAGERY_CACHE_SECONDS}`,
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }

    const labelsMatch = url.pathname.match(/^\/api\/labels\/(\d+)\/(\d+)\/(\d+)$/);
    if (labelsMatch) {
      const [, z, x, y] = labelsMatch;
      const response = await labelTile(Number(z), Number(x), Number(y));
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        headers: {
          ...headers,
          'Content-Type': response.headers.get('Content-Type') || 'image/png',
          'Cache-Control': response.headers.get('Cache-Control') || `public, max-age=${IMAGERY_CACHE_SECONDS}`,
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }

    if (url.pathname === '/api/geocode') {
      const query = (url.searchParams.get('q') || '').trim();
      if (query.length < 2 || query.length > 120) {
        return Response.json({ error: 'Search query must be 2–120 characters.' }, { status: 400, headers });
      }
      try {
        const response = await geocode(query);
        const body = await response.text();
        return new Response(body, {
          status: response.status,
          headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': response.headers.get('Cache-Control') || 'public, max-age=86400' },
        });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Geocoding failed' }, { status: 502, headers });
      }
    }

    if (url.pathname === '/api/active-satellites') {
      try {
        const response = await getActiveCatalogResponse();
        return new Response(response.body, {
          status: response.status,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Cache-Control': response.headers.get('Cache-Control') || 'public, max-age=7200',
          },
        });
      } catch (error) {
        return Response.json({
          error: error instanceof Error ? error.message : 'Unable to load active satellite catalog',
        }, { status: 502, headers });
      }
    }

    if (url.pathname !== '/api/starlink') return Response.json({ error: 'Not found' }, { status: 404, headers });

    const requested = Number(url.searchParams.get('limit') || '900');
    const limit = Math.max(50, Math.min(2000, Number.isFinite(requested) ? requested : 900));
    const payload = await getImmediateData(ctx);
    const sampled = sampleEvenly(payload.satellites, limit);
    const sourceLabel = payload.source === 'bundled-fallback'
      ? 'Bundled Starlink OMM fallback'
      : payload.source.includes('supplemental')
        ? 'CelesTrak SupGP / SpaceX ephemeris'
        : 'CelesTrak GP / Starlink';

    return Response.json({
      source: sourceLabel,
      sourceUrl: payload.source === 'bundled-fallback' ? null : payload.source,
      fetchedAt: new Date(payload.fetchedAt).toISOString(),
      stale: payload.stale,
      total: payload.satellites.length,
      returned: sampled.length,
      satellites: sampled,
    }, { headers: { ...headers, 'Cache-Control': 'public, max-age=300' } });
  },
} satisfies ExportedHandler<Env>;