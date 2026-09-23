interface Env { ALLOWED_ORIGIN?: string }
type OmmRecord = Record<string, string | number | null>;

const SOURCE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON';
const TWO_HOURS = 60 * 60 * 2;

function cors(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function getStarlinkData(): Promise<OmmRecord[]> {
  const cache = caches.default;
  const key = new Request(SOURCE);
  let response = await cache.match(key);

  if (!response) {
    const upstream = await fetch(SOURCE, {
      headers: { 'User-Agent': 'leo-link-lab/0.1 educational-project' },
    });
    if (!upstream.ok) throw new Error(`CelesTrak returned HTTP ${upstream.status}`);
    response = new Response(upstream.body, upstream);
    response.headers.set('Cache-Control', `public, max-age=${TWO_HOURS}`);
    await cache.put(key, response.clone());
  }
  return response.json<OmmRecord[]>();
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
      const data = await getStarlinkData();
      const sampled = sampleEvenly(data, limit);
      return Response.json({
        source: 'CelesTrak GP / Starlink',
        total: data.length,
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