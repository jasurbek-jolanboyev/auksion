export async function onRequest({ request, env }) {
  if (!env.API_ORIGIN) {
    return new Response('Image server is not configured.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  let origin;
  try {
    origin = new URL(env.API_ORIGIN);
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Invalid API origin');
    origin.pathname = '/';
    origin.search = '';
    origin.hash = '';
  } catch {
    return new Response('Image server configuration is invalid.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  const incoming = new URL(request.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', incoming.protocol.slice(0, -1));
  const forwarded = new Request(upstream, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual'
  });
  return fetch(forwarded);
}
