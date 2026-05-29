import type { NextApiRequest, NextApiResponse } from 'next';
import { buildBackendRequestInit, buildBackendUrl, fetchBackend, isBackendTimeoutError } from '@/lib/backendApi.mjs';
import { resolveSessionAuthorizationHeader } from '@/lib/authSession.mjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { session } = req.query;
  if (!session || typeof session !== 'string') return res.status(400).json({ error: 'Missing session' });

  if (req.method === 'GET') {
    try {
      const backendPath = `/live/${session}`;
      const authorization = resolveSessionAuthorizationHeader({ req, backendPath });
      const response = await fetchBackend(
        buildBackendUrl(backendPath),
        buildBackendRequestInit({
          headers: authorization ? { Authorization: authorization } : {},
        }),
      );
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (error) {
      if (isBackendTimeoutError(error)) {
        return res.status(504).json({ error: 'Live session request timed out' });
      }
      return res.status(500).json({ error: 'Live session error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const backendPath = `/live/${session}/update`;
      const authorization = resolveSessionAuthorizationHeader({ req, backendPath });
      const response = await fetchBackend(
        buildBackendUrl(backendPath),
        buildBackendRequestInit({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authorization ? { Authorization: authorization } : {}),
          },
          body: JSON.stringify(req.body),
        }),
      );
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (error) {
      if (isBackendTimeoutError(error)) {
        return res.status(504).json({ error: 'Live session update timed out' });
      }
      return res.status(500).json({ error: 'Live session update error' });
    }
  }

  return res.status(405).end();
}
