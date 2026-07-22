export function handleHealth(request, response, context) {
  if (request.method !== "GET") {
    return false;
  }

  if (context.url.pathname !== "/health") {
    return false;
  }

  context.sendJson(response, 200, {
    ok: true,
    version: context.version,
  });
  return true;
}
