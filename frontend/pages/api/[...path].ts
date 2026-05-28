import type { NextApiRequest, NextApiResponse } from 'next';
import {
  buildBackendUrl,
  buildBackendRequestHeaders,
  resolveBackendProxyPath,
} from '@/lib/backendApi.mjs';
import { resolveSessionAuthorizationHeader } from '@/lib/authSession.mjs';

const REQUEST_HEADER_SKIP_LIST = new Set([
  'connection',
  'cookie',
  'content-length',
  'host',
  'transfer-encoding',
]);

const RESPONSE_HEADER_SKIP_LIST = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'transfer-encoding',
]);

export const config = {
  api: {
    bodyParser: false,
  },
};

function buildProxyTarget(req: NextApiRequest) {
  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path || '');
  const backendPath = resolveBackendProxyPath(path);
  if (!backendPath) {
    return null;
  }
  const targetUrl = buildBackendUrl(backendPath);

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        searchParams.append(key, entry);
      }
      continue;
    }

    if (typeof value === 'string') {
      searchParams.append(key, value);
    }
  }

  const queryString = searchParams.toString();
  return {
    backendPath,
    targetUrl: queryString ? `${targetUrl}?${queryString}` : targetUrl,
  };
}

function buildProxyHeaders(req: NextApiRequest, backendPath: string) {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || REQUEST_HEADER_SKIP_LIST.has(key.toLowerCase())) {
      continue;
    }

    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }

  const proxyHeaders = buildBackendRequestHeaders(headers);
  const sessionAuthorization = resolveSessionAuthorizationHeader({
    req,
    backendPath,
    authorizationHeader: proxyHeaders.authorization || proxyHeaders.Authorization || '',
  });

  delete proxyHeaders.Authorization;
  if (sessionAuthorization) {
    proxyHeaders.authorization = sessionAuthorization;
  } else {
    delete proxyHeaders.authorization;
  }

  return proxyHeaders;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const target = buildProxyTarget(req);
  if (!target) {
    return res.status(404).json({ error: 'Unknown API route' });
  }

  try {
    const requestInit: RequestInit & { duplex?: 'half' } = {
      method: req.method,
      headers: buildProxyHeaders(req, target.backendPath),
    };

    if (req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
      requestInit.body = req as unknown as BodyInit;
      requestInit.duplex = 'half';
    }

    const response = await fetch(target.targetUrl, requestInit);

    for (const [key, value] of response.headers.entries()) {
      if (RESPONSE_HEADER_SKIP_LIST.has(key.toLowerCase())) {
        continue;
      }
      res.setHeader(key, value);
    }

    const body = Buffer.from(await response.arrayBuffer());
    res.status(response.status).send(body);
  } catch (error) {
    console.error('Backend catch-all proxy error:', error);
    return res.status(502).json({ error: 'Backend proxy error' });
  }
}
