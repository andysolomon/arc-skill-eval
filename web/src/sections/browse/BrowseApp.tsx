import { useEffect, useMemo, useState } from 'react';
import { SkillPicker } from '@/components/SkillPicker';
import { useEnv } from '@/state/env';
import { useWorkspace } from '@/state/workspace';
import { BrowseCaseList } from './BrowseCaseList';
import { BrowseDetail } from './BrowseDetail';
import { BrowseEmptyState } from './BrowseEmptyState';
import { BrowseRuns } from './BrowseRuns';
import { useBrowseData } from './useBrowseData';

export const BrowseApp = () => {
  const { env } = useEnv();
  const { skills: workspaceSkills } = useWorkspace();
  const [selectedSkillId, setSelectedSkillId] = useState<string | undefined>();
  const { availableSkillIds, runs } = useBrowseData(selectedSkillId);
  const skillIds = useMemo(() => {
    const available = new Set(availableSkillIds);
    // workspaceSkills can hold the same id in two locations (e.g. a skill under
    // both .agents/skills and pilots), so dedupe or the picker shows twins.
    const ordered = [
      ...new Set(workspaceSkills.map((skill) => skill.id).filter((skillId) => available.has(skillId))),
    ];

    return [...ordered, ...availableSkillIds.filter((skillId) => !ordered.includes(skillId))];
  }, [availableSkillIds, workspaceSkills]);
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
    if (skillIds.length === 0) {
      setSelectedSkillId(undefined);
      return;
    }

    if (!selectedSkillId || !skillIds.includes(selectedSkillId)) {
      setSelectedSkillId(skillIds[0]);
    }
  }, [selectedSkillId, skillIds]);

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

  const activeRun = selectedRun ?? runs[0];
  const activeCase =
    selectedCase ??
    activeRun?.cases.find((testCase) => testCase.status === 'fail') ??
    activeRun?.cases[0];

  return (
    <main
      className="app-main"
      data-screen-label={`browse (${env})`}
      data-testid={activeRun && activeCase ? 'browse-app' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        padding: 0,
      }}
    >
      {skillIds.length > 0 ? (
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid var(--tt-border)',
            display: 'flex',
            flex: 'none',
            flexWrap: 'wrap',
            fontSize: 12,
            gap: 8,
            padding: '9px 16px',
          }}
        >
          <span
            style={{
              color: env === 'hosted' ? 'var(--tt-cyan)' : 'var(--tt-green)',
              fontWeight: 700,
            }}
          >
            {env === 'hosted' ? 'Hosted' : 'Localhost'}
          </span>
          <SkillPicker
            label="browsing"
            onSelectSkill={setSelectedSkillId}
            selectedSkillId={selectedSkillId}
            skillIds={skillIds}
          />
          <span style={{ color: 'var(--tt-comment)' }}>
            {env === 'hosted' ? (
              <>
                Browsing imported runs. Import run JSON in{' '}
                <span style={{ color: 'var(--tt-fg-dark)' }}>Review</span> to add results.
              </>
            ) : (
              <>
                Reading <span style={{ color: 'var(--tt-teal)' }}>./evals-runs</span> from disk.
              </>
            )}
          </span>
        </div>
      ) : null}
      {activeRun && activeCase ? (
        <section
          aria-label="Browse run results"
          style={{
            display: 'flex',
            flex: 1,
            gap: 10,
            minHeight: 0,
            minWidth: 0,
            padding: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              flex: 'none',
              flexDirection: 'column',
              gap: 10,
              minHeight: 0,
              width: 326,
            }}
          >
            <BrowseRuns
              runs={runs}
              selectedRunId={activeRun.id}
              onSelectRun={setSelectedRunId}
            />
            <BrowseCaseList
              cases={activeRun.cases}
              selectedCaseId={activeCase.id}
              onSelectCase={setSelectedCaseId}
            />
          </div>
          <BrowseDetail
            run={activeRun}
            testCase={activeCase}
            workspaceRoot={activeRun.workspaceRoot}
          />
        </section>
      ) : (
        <BrowseEmptyState env={env} />
      )}
    </main>
  );
};
