interface Env { ALLOWED_ORIGIN?: string }
type OmmRecord = Record<string, string | number | null>;
type CachedPayload = { fetchedAt: number; source: string; satellites: OmmRecord[] };

const SOURCES = [
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=STARLINK&FORMAT=JSON',
  'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?SOURCE=SpaceX-E&FORMAT=JSON',
];
const REFRESH_MS = 2 * 60 * 60 * 1000;
const STALE_TTL_SECONDS = 24 * 60 * 60;
const CACHE_KEY = new Request('https://leo-link-lab.internal/cache/starlink');

function cors(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function fetchSource(url: string): Promise<OmmRecord[]> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'leo-link-lab/0.1 educational-project' },
  });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  const data = await response.json<OmmRecord[]>();
  if (!Array.isArray(data) || data.length === 0) throw new Error('CelesTrak returned an empty dataset');
  return data;
}

async function getStarlinkData(): Promise<CachedPayload & { stale: boolean }> {
  const cache = caches.default;
  const cachedResponse = await cache.match(CACHE_KEY);
  const cached = cachedResponse ? await cachedResponse.json<CachedPayload>() : null;
  const ageMs = cached ? Date.now() - cached.fetchedAt : Number.POSITIVE_INFINITY;

  if (cached && ageMs < REFRESH_MS) return { ...cached, stale: false };

  const errors: string[] = [];
  for (const source of SOURCES) {
    try {
      const satellites = await fetchSource(source);
      const payload: CachedPayload = { fetchedAt: Date.now(), source, satellites };
      await cache.put(CACHE_KEY, Response.json(payload, {
        headers: { 'Cache-Control': `public, max-age=${STALE_TTL_SECONDS}` },
      }));
      return { ...payload, stale: false };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (cached) return { ...cached, stale: true };
  throw new Error(errors.join(' | '));
}

function sampleEvenly<T>(items: T[], limit: number) {
  if (items.length <= limit) return items;
  const stride = items.length / limit;
  return Array.from({ length: limit }, (_, i) => items[Math.floor(i * stride)]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = cors(env);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname === '/health') return Response.json({ ok: true }, { headers });
    if (url.pathname !== '/api/starlink') return Response.json({ error: 'Not found' }, { status: 404, headers });

    try {
      const requested = Number(url.searchParams.get('limit') || '900');
      const limit = Math.max(50, Math.min(2000, Number.isFinite(requested) ? requested : 900));
      const payload = await getStarlinkData();
      const sampled = sampleEvenly(payload.satellites, limit);
      return Response.json({
        source: payload.source.includes('supplemental') ? 'CelesTrak SupGP / SpaceX ephemeris' : 'CelesTrak GP / Starlink',
        sourceUrl: payload.source,
        fetchedAt: new Date(payload.fetchedAt).toISOString(),
        stale: payload.stale,
        total: payload.satellites.length,
        returned: sampled.length,
        satellites: sampled,
      }, { headers: { ...headers, 'Cache-Control': 'public, max-age=300' } });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unknown upstream error' },
        { status: 502, headers }
      );
    }
  },
} satisfies ExportedHandler<Env>;