import { useCallback, useEffect, useRef, useState } from 'react';
import {
  weeklyReflectionsSchema,
  type ComputedWeeklyReviewDto,
  type WeeklyReflections,
  type WeeklyReviewDto,
} from '@personal-os/shared';
import { ApiError, intelligenceApi, type Page } from '@/lib/api';
import { localDateIn } from '@/features/studies/time';
import { previousWeekStart, weekStartFor } from './time';

export type ReviewSelection =
  | { readonly mode: 'computed'; readonly weekStart: string }
  | { readonly mode: 'saved'; readonly id: string };

export interface ReviewController {
  selection: ReviewSelection;
  currentWeekStart: string;
  previousWeekStartValue: string;
  status: 'loading' | 'ready' | 'error';
  message: string | null;
  computed: ComputedWeeklyReviewDto | null;
  saved: WeeklyReviewDto | null;
  /** Snapshot congelado no salvamento; nunca recalculado. */
  snapshot: ComputedWeeklyReviewDto['snapshot'] | null;
  reflections: WeeklyReflections;
  busy: boolean;
  history: Page<WeeklyReviewDto>;
  historyLoadingMore: boolean;
  selectWeek: (week: 'current' | 'previous') => void;
  selectSaved: (id: string) => void;
  setReflection: (field: keyof WeeklyReflections, value: string) => void;
  save: () => Promise<void>;
  update: () => Promise<void>;
  loadHistoryMore: () => void;
  reload: () => void;
}

const EMPTY_REFLECTIONS: WeeklyReflections = {
  worked: null,
  didntWork: null,
  learned: null,
  change: null,
  focus: null,
};

function failureMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'conflict') {
    return 'A revisão foi alterada em outra sessão. Recarregue antes de atualizar.';
  }
  if (error instanceof Error) return error.message;
  return 'Não foi possível concluir a operação.';
}

/** Revisões são computadas sob demanda; somente reflexões e snapshots são gravados. */
export function useReview(timezone: string): ReviewController {
  const currentWeekStart = weekStartFor(localDateIn(timezone, new Date()));
  const [selection, setSelection] = useState<ReviewSelection>({
    mode: 'computed',
    weekStart: currentWeekStart,
  });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [computed, setComputed] = useState<ComputedWeeklyReviewDto | null>(null);
  const [saved, setSaved] = useState<WeeklyReviewDto | null>(null);
  const [reflections, setReflections] = useState<WeeklyReflections>(EMPTY_REFLECTIONS);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [history, setHistory] = useState<Page<WeeklyReviewDto>>({ items: [], hasMore: false });
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const keyRef = useRef<string | null>(null);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono */
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setMessage(null);
    setComputed(null);
    setSaved(null);
    setReflections(EMPTY_REFLECTIONS);
    const selected: ReviewSelection = selection;

    void (async () => {
      try {
        if (selected.mode === 'computed') {
          const result = await intelligenceApi.review(selected.weekStart, controller.signal);
          if (controller.signal.aborted) return;
          setComputed(result);
          setSaved(result.saved);
          setReflections(result.saved?.reflections ?? EMPTY_REFLECTIONS);
        } else {
          const result = await intelligenceApi.getSavedReview(selected.id, controller.signal);
          if (controller.signal.aborted) return;
          setSaved(result);
          setReflections(result.reflections);
        }
        if (!controller.signal.aborted) setStatus('ready');
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setMessage(failureMessage(error));
          setStatus('error');
        }
      }
    })();
    return () => controller.abort();
  }, [selection, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    void intelligenceApi
      .listSavedReviews({ limit: 25 }, controller.signal)
      .then((result) => setHistory(result))
      .catch(() => {
        // Histórico indisponível não invalida a revisão da semana.
      });
    return () => controller.abort();
  }, [attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectWeek = useCallback(
    (week: 'current' | 'previous') => {
      keyRef.current = null;
      setSelection({
        mode: 'computed',
        weekStart: week === 'current' ? currentWeekStart : previousWeekStart(currentWeekStart),
      });
    },
    [currentWeekStart],
  );

  const selectSaved = useCallback((id: string) => {
    keyRef.current = null;
    setSelection({ mode: 'saved', id });
  }, []);

  const setReflection = useCallback((field: keyof WeeklyReflections, value: string) => {
    setReflections((current) => ({
      ...current,
      [field]: value.trim() === '' ? null : value,
    }));
  }, []);

  const activeSnapshot =
    saved?.snapshot ?? (selection.mode === 'computed' ? computed?.snapshot : null) ?? null;

  const save = useCallback(async () => {
    if (selection.mode !== 'computed' || busy) return;
    keyRef.current ??= crypto.randomUUID();
    setBusy(true);
    try {
      const parsed = weeklyReflectionsSchema.parse(reflections);
      const result = await intelligenceApi.saveReview(
        {
          weekStart: selection.weekStart,
          timezone,
          ...(Object.keys(parsed).length > 0 ? { reflections: parsed } : {}),
        },
        keyRef.current,
      );
      keyRef.current = null;
      setSaved(result);
      setComputed((current) => (current === null ? null : { ...current, saved: result }));
      setReflections(result.reflections);
      reload();
    } catch (error: unknown) {
      setMessage(failureMessage(error));
    } finally {
      setBusy(false);
    }
  }, [busy, reflections, reload, selection, timezone]);

  const update = useCallback(async () => {
    if (saved === null || busy) return;
    keyRef.current ??= crypto.randomUUID();
    setBusy(true);
    try {
      const parsed = weeklyReflectionsSchema.parse(reflections);
      const result = await intelligenceApi.updateReview(
        saved.id,
        { reflections: parsed, version: saved.version },
        keyRef.current,
        saved.version,
      );
      keyRef.current = null;
      setSaved(result);
      setReflections(result.reflections);
      reload();
    } catch (error: unknown) {
      setMessage(failureMessage(error));
    } finally {
      setBusy(false);
    }
  }, [busy, reflections, reload, saved]);

  const loadHistoryMore = useCallback(() => {
    if (!history.hasMore || history.nextCursor === undefined || historyLoadingMore) return;
    setHistoryLoadingMore(true);
    void intelligenceApi
      .listSavedReviews({ limit: 25, cursor: history.nextCursor })
      .then((next) => {
        setHistory((current) => ({
          items: [...current.items, ...next.items],
          nextCursor: next.nextCursor,
          hasMore: next.hasMore,
        }));
      })
      .catch(() => {
        // Mantém a página atual em caso de falha.
      })
      .finally(() => setHistoryLoadingMore(false));
  }, [history.hasMore, history.nextCursor, historyLoadingMore]);

  return {
    selection,
    currentWeekStart,
    previousWeekStartValue: previousWeekStart(currentWeekStart),
    status,
    message,
    computed,
    saved,
    snapshot: activeSnapshot,
    reflections,
    busy,
    history,
    historyLoadingMore,
    selectWeek,
    selectSaved,
    setReflection,
    save,
    update,
    loadHistoryMore,
    reload,
  };
}
