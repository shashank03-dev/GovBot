import { useEffect } from 'react';
import { useRouter } from 'next/router';

import {
  buildOfficialLoginHref,
  resolveOfficialSessionState,
  sanitizeOfficialNextPath,
} from '@/lib/officialSession.mjs';

export function useOfficialRouteGuard() {
  const router = useRouter();
  const isChecking = !router.isReady;
  const isAuthorized =
    !isChecking &&
    typeof window !== 'undefined' &&
    resolveOfficialSessionState({
      hasMounted: true,
      storage: window.localStorage,
    });

  useEffect(() => {
    if (isChecking || isAuthorized) {
      return;
    }

    const currentPath =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : router.asPath;

    const target = buildOfficialLoginHref(sanitizeOfficialNextPath(currentPath));
    if (typeof window !== 'undefined') {
      window.location.replace(target);
      return;
    }

    void router.replace(target);
  }, [isAuthorized, isChecking, router]);

  return { isAuthorized, isChecking };
}
