export async function onRequest({ request, env }) {
  if (!env.API_ORIGIN) {
    return Response.json({ error: 'API_NOT_CONFIGURED', message: 'Sayt API manzili sozlanmagan.' }, { status: 503 });
  }

  let origin;
  try {
    origin = new URL(env.API_ORIGIN);
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Invalid API origin');
    origin.pathname = '/';
    origin.search = '';
    origin.hash = '';
  } catch {
    return Response.json({ error: 'API_CONFIGURATION_INVALID', message: 'Sayt API manzili noto‘g‘ri sozlangan.' }, { status: 503 });
  }

  const incoming = new URL(request.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', incoming.protocol.slice(0, -1));
  const forwarded = new Request(upstream, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
  return fetch(forwarded);
}
