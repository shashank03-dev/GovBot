import { useEffect, useState } from 'react';

import { buildProxyApiPath } from '@/lib/backendApi.mjs';
import { buildSSPDraft } from '@/lib/sspDraft.mjs';
import { getStoredLanguage, setStoredLanguage } from '@/components/LanguageSelector';

type DraftShape = {
  current_step: string;
  language: 'en' | 'kn';
  fields: Record<string, unknown>;
  submission_status: string;
  confirmation_number: string | null;
};

type SyncDraftResponse = {
  status: string;
  draft: DraftShape;
  updated_fields?: string[];
  updated_count?: number;
};

function normalizeLanguage(value?: string): 'en' | 'kn' {
  return value === 'kn' ? 'kn' : 'en';
}

function getStoredLanguagePreference(): 'en' | 'kn' | undefined {
  if (typeof window === 'undefined') return undefined;
  const language = localStorage.getItem('govbot_lang');
  if (language === 'en' || language === 'kn') {
    return language;
  }
  return undefined;
}

function hydrateDraftWithStep(defaultStep: string, saved: Partial<DraftShape>) {
  return buildSSPDraft({
    saved: {
      ...saved,
      current_step: saved.current_step || defaultStep,
    },
    preferredLanguage: getStoredLanguagePreference(),
  }) as DraftShape;
}

export function useSSPDraft(defaultStep = 'step-1') {
  const [draft, setDraft] = useState<DraftShape>(() =>
    hydrateDraftWithStep(defaultStep, {
      current_step: defaultStep,
      language: normalizeLanguage(getStoredLanguage()),
    }),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    const storedPhone = localStorage.getItem('govbot_phone') || '';
    const storedToken = localStorage.getItem('govbot_token') || '';

    setPhone(storedPhone);
    setToken(storedToken);

    if (!storedPhone) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const response = await fetch(buildProxyApiPath(`ssp/draft/${encodeURIComponent(storedPhone)}`), {
          headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
        });
        if (!response.ok) {
          throw new Error(`Draft request failed with ${response.status}`);
        }
        const payload = await response.json();
        const nextDraft = hydrateDraftWithStep(defaultStep, payload.draft || {});
        setDraft(nextDraft);
        setStoredLanguage(nextDraft.language);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load SSP draft');
        setDraft((current) => hydrateDraftWithStep(defaultStep, {
          ...current,
          current_step: defaultStep,
          language: normalizeLanguage(current.language),
        }));
      } finally {
        setLoading(false);
      }
    })();
  }, [defaultStep]);

  const setLanguage = (language: 'en' | 'kn') => {
    setStoredLanguage(language);
    setDraft((current) => ({
      ...current,
      language,
    }));
  };

  const updateFields = (updates: Record<string, unknown>) => {
    setDraft((current) => ({
      ...current,
      fields: {
        ...current.fields,
        ...updates,
      },
    }));
  };

  const saveDraft = async (overrides: Partial<DraftShape> = {}) => {
    if (!phone) return draft;

    const payload: DraftShape = {
      ...draft,
      ...overrides,
      fields: {
        ...draft.fields,
        ...(overrides.fields || {}),
      },
    };

    const response = await fetch(buildProxyApiPath(`ssp/draft/${encodeURIComponent(phone)}`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Draft save failed with ${response.status}`);
    }

    const result = await response.json();
    const nextDraft = hydrateDraftWithStep(defaultStep, result.draft || {});
    setDraft(nextDraft);
    return nextDraft;
  };

  const submitDraft = async (overrides: Partial<DraftShape> = {}) => {
    if (!phone) throw new Error('You must be logged in to submit.');

    const payload: DraftShape = {
      ...draft,
      ...overrides,
      fields: {
        ...draft.fields,
        ...(overrides.fields || {}),
      },
    };

    const response = await fetch(buildProxyApiPath(`ssp/draft/${encodeURIComponent(phone)}/submit`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure?.detail?.error || `Draft submit failed with ${response.status}`);
    }

    const result = await response.json();
    const nextDraft = hydrateDraftWithStep(defaultStep, result.draft || {});
    setDraft(nextDraft);
    return {
      ...result,
      draft: nextDraft,
    };
  };

  const syncProfile = async () => {
    if (!phone) throw new Error('You must be logged in to sync your profile.');

    const response = await fetch(buildProxyApiPath(`ssp/draft/${encodeURIComponent(phone)}/sync-profile`), {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure?.detail || `Profile sync failed with ${response.status}`);
    }

    const result = (await response.json()) as SyncDraftResponse;
    const nextDraft = hydrateDraftWithStep(defaultStep, result.draft || {});
    setDraft(nextDraft);
    setStoredLanguage(nextDraft.language);
    return {
      ...result,
      draft: nextDraft,
    };
  };

  return {
    draft,
    error,
    loading,
    phone,
    token,
    language: normalizeLanguage(draft.language),
    setLanguage,
    updateFields,
    saveDraft,
    submitDraft,
    syncProfile,
    setDraft,
    studentName: String(draft.fields.student_name || ''),
    studentId: String(draft.fields.student_id || phone.slice(-10) || ''),
  };
}
