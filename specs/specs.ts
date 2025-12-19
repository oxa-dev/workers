/**
 * A Cloudflare Worker to serve OXA JSON Schema, JSON-LD and other specs
 *
 * Acts as a reverse proxy to translate requested paths and `Content-Type`
 * headers into requests for files from the oxa-dev/oxa GitHub repository.
 *
 * Handles versioned paths like /v1/schema.json, /v2.0/schema.json, etc.
 * and rewrites them to fetch from the corresponding GitHub branch/tag.
 */
export default {
  async fetch(request: Request) {
    const CORS_HEADERS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Accept',
      // Cache the pre-flight result for 24 h
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    let path = url.pathname.slice(1);

    // Determine which version to use from /v* paths
    // Examples: /v1/schema.json -> version: v1, path: schema.json
    //           /v2.0/schema.json -> version: v2.0, path: schema.json
    //           /v1.2.3/schema.json -> version: v1.2.3, path: schema.json
    //           /schema.json -> version: main, path: schema.json
    let version = 'main';
    const versionMatch = path.match(/^v\d+(\.\d+)*\//);
    if (versionMatch) {
      // Extract version (e.g., "v1", "v2.0", or "v1.2.3") and remove it from path
      version = versionMatch[0].slice(0, -1); // Remove trailing slash
      path = path.slice(versionMatch[0].length);
    }

    // Apply basic content negotiation based on the `Accept` header
    const accept = request.headers.get('Accept') ?? '';
    if (accept.includes('application/ld+json') && !path.endsWith('.jsonld')) {
      path += '.jsonld';
    } else if (accept.includes('application/schema+json') && !path.endsWith('schema.json')) {
      path += '.schema.json';
    }

    // Complete path and content type header value
    let contentType = 'text/plain; charset=utf-8';
    if (path.endsWith('.jsonld')) {
      path = `schema/${path}`;
      contentType = 'application/ld+json';
    } else if (path.endsWith('.schema.json')) {
      path = `schema/${path}`;
      contentType = 'application/schema+json';
    }

    const githubUrl = `https://raw.githubusercontent.com/oxa-dev/oxa/${version}/${path}`;
    const file = await fetch(githubUrl);

    // If the file wasn't found, return a 404
    if (!file.ok) {
      return new Response(`File not found: ${path} (version: ${version})`, {
        status: file.status,
        headers: CORS_HEADERS,
      });
    }

    return new Response(file.body, {
      headers: {
        'Content-Type': contentType,
        ...CORS_HEADERS,
      },
    });
  },
};
