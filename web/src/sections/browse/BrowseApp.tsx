import { useEffect, useMemo, useState } from 'react';
import { useEnv } from '@/state/env';
import { BrowseCaseList } from './BrowseCaseList';
import { BrowseDetail } from './BrowseDetail';
import { BrowseEmptyState } from './BrowseEmptyState';
import { BrowseRuns } from './BrowseRuns';
import { useBrowseData } from './useBrowseData';

export const BrowseApp = () => {
  const { env } = useEnv();
  const { runs } = useBrowseData();
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId),
    [runs, selectedRunId],
  );
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>();
  const selectedCase = useMemo(
    () => selectedRun?.cases.find((testCase) => testCase.id === selectedCaseId),
    [selectedCaseId, selectedRun],
  );

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(undefined);
      setSelectedCaseId(undefined);
      return;
    }

    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    if (!selectedRun) {
      setSelectedCaseId(undefined);
      return;
    }

    if (!selectedCaseId || !selectedRun.cases.some((testCase) => testCase.id === selectedCaseId)) {
      const failedCase = selectedRun.cases.find((testCase) => testCase.status === 'fail');
      setSelectedCaseId(failedCase?.id ?? selectedRun.cases[0]?.id);
    }
  }, [selectedCaseId, selectedRun]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;

      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return;
      }

      if (!selectedRun || (event.key !== 'j' && event.key !== 'k')) {
        return;
      }

      const currentIndex = selectedRun.cases.findIndex((testCase) => testCase.id === selectedCaseId);
      if (currentIndex < 0) {
        return;
      }

      event.preventDefault();
      const nextIndex =
        event.key === 'j'
          ? Math.min(selectedRun.cases.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
      setSelectedCaseId(selectedRun.cases[nextIndex]?.id);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCaseId, selectedRun]);

  if (runs.length === 0) {
    return <BrowseEmptyState env={env} />;
  }

  if (!selectedRun || !selectedCase) {
    return null;
  }

  return (
    <main
      className="app-main"
      data-screen-label={`browse (${env})`}
      data-testid="browse-app"
      style={{ minWidth: 0, overflow: 'auto', padding: 16 }}
    >
      <section
        aria-label="Browse workspace"
        style={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns: '200px 280px minmax(0, 1fr)',
          minHeight: 'calc(100vh - 116px)',
          minWidth: 960,
        }}
      >
        <BrowseRuns runs={runs} selectedRunId={selectedRun.id} onSelectRun={setSelectedRunId} />
        <BrowseCaseList
          cases={selectedRun.cases}
          selectedCaseId={selectedCase.id}
          onSelectCase={setSelectedCaseId}
        />
        <BrowseDetail run={selectedRun} testCase={selectedCase} />
      </section>
    </main>
  );
};
