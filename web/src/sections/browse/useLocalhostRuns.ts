import { useEffect, useState } from 'react';
import type { ReviewRun } from '@/sections/review/useReviewData';
import { useEnv } from '@/state/env';
import { useWorkspace } from '@/state/workspace';

export type LocalhostRunsStatus = 'loading' | 'live' | 'offline';

const parseRuns = (payload: unknown): ReviewRun[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.runs)) {
    return [];
  }

  return record.runs
    .filter(
      (run): run is Record<string, unknown> =>
        !!run &&
        typeof run === 'object' &&
        typeof (run as Record<string, unknown>).id === 'string',
    )
    .map((run) => ({
      ...run,
      cases: Array.isArray(run.cases) ? run.cases : [],
    })) as ReviewRun[];
};

export const useLocalhostRuns = (skillId?: string) => {
  const { env } = useEnv();
  const { workspace } = useWorkspace();
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [availableSkillIds, setAvailableSkillIds] = useState<string[]>([]);
  const [status, setStatus] = useState<LocalhostRunsStatus>('offline');

  useEffect(() => {
    setAvailableSkillIds([]);
  }, [env, workspace]);

  useEffect(() => {
    if (env !== 'localhost') {
      setRuns([]);
      setAvailableSkillIds([]);
      setStatus('offline');
      return undefined;
    }

    const controller = new AbortController();
    setStatus('loading');

    const query = new URLSearchParams({ root: workspace });
    if (skillId) {
      query.set('skill', skillId);
    }

    void fetch(`http://localhost:7357/runs?${query.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`runs lookup failed with ${response.status}`);
        }

        const payload = await response.json();
        const nextRuns = parseRuns(payload);
        setRuns(nextRuns);
        setAvailableSkillIds((current) => {
          const discovered = [...new Set(nextRuns.map((run) => run.skill))];
          return skillId ? [...new Set([...current, ...discovered])] : discovered;
        });
        setStatus('live');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRuns([]);
          setAvailableSkillIds([]);
          setStatus('offline');
        }
      });

    return () => controller.abort();
  }, [env, skillId, workspace]);

  if (env !== 'localhost') {
    return { availableSkillIds: [], runs: [], status: 'offline' as const };
  }

  return { availableSkillIds, runs, status };
};
