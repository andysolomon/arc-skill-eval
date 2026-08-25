import { useEffect, useMemo, useState } from 'react';
import { SkillPicker } from '@/components/SkillPicker';
import { useLocalhostRuns } from '@/sections/browse/useLocalhostRuns';
import { useEnv } from '@/state/env';
import { useWorkspace } from '@/state/workspace';
import { ReviewFeedbackImprove } from './ReviewFeedbackImprove';
import { ReviewImportPanel } from './ReviewImportPanel';
import { ReviewRuns } from './ReviewRuns';
import { ReviewSummary } from './ReviewSummary';
import { useReviewData } from './useReviewData';

export const ReviewApp = () => {
  const { env } = useEnv();
  const { skills: workspaceSkills } = useWorkspace();
  const [selectedSkillId, setSelectedSkillId] = useState<string | undefined>();
  const {
    createSampleReviewRun,
    feedbackByRun,
    importRuns,
    improvePlansByRun,
    lastRunId,
    recordFeedback,
    removeFeedback,
    runs: reviewRuns,
  } = useReviewData();
  const {
    availableSkillIds: localhostSkillIds,
    runs: localhostRuns,
  } = useLocalhostRuns(selectedSkillId);

  // On localhost, review both the runs the daemon reads from disk AND any
  // artifact imported via the inspect panel (deduped by id). Hosted has no
  // daemon, so it reviews imported runs only.
  const allRuns = useMemo(() => {
    if (env !== 'localhost') {
      return reviewRuns;
    }

    const seen = new Set(localhostRuns.map((run) => run.id));
    return [...localhostRuns, ...reviewRuns.filter((run) => !seen.has(run.id))];
  }, [env, localhostRuns, reviewRuns]);

  const skillIds = useMemo(() => {
    const importedSkillIds = [...new Set(reviewRuns.map((run) => run.skill))];
    const availableSkillIds =
      env === 'localhost'
        ? [...new Set([...localhostSkillIds, ...importedSkillIds])]
        : importedSkillIds;
    const available = new Set(availableSkillIds);
    // workspaceSkills can hold the same id in two locations (e.g. a skill under
    // both .agents/skills and pilots), so dedupe or the picker shows twins.
    const ordered = [
      ...new Set(workspaceSkills.map((skill) => skill.id).filter((skillId) => available.has(skillId))),
    ];

    return [...ordered, ...availableSkillIds.filter((skillId) => !ordered.includes(skillId))];
  }, [env, localhostSkillIds, reviewRuns, workspaceSkills]);

  useEffect(() => {
    if (skillIds.length === 0) {
      setSelectedSkillId(undefined);
      return;
    }

    if (!selectedSkillId || !skillIds.includes(selectedSkillId)) {
      setSelectedSkillId(skillIds[0]);
    }
  }, [selectedSkillId, skillIds]);

  const runs = useMemo(
    () => (selectedSkillId ? allRuns.filter((run) => run.skill === selectedSkillId) : allRuns),
    [allRuns, selectedSkillId],
  );

  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId),
    [runs, selectedRunId],
  );
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>();

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(undefined);
      setSelectedCaseId(undefined);
      return;
    }

    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      const preferredRun = runs.find((run) => run.id === lastRunId);
      setSelectedRunId(preferredRun?.id ?? runs[0].id);
    }
  }, [lastRunId, runs, selectedRunId]);

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

  const hasRuns = runs.length > 0 && selectedRun;

  return (
    <main
      className="app-main"
      data-testid={hasRuns ? 'review-app' : 'review-empty-state'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        padding: 0,
      }}
    >
      {env === 'localhost' && localhostSkillIds.length > 0 ? (
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
          <span style={{ color: 'var(--tt-green)', fontWeight: 700 }}>Localhost</span>
          <SkillPicker
            label="reviewing"
            onSelectSkill={setSelectedSkillId}
            selectedSkillId={selectedSkillId}
            skillIds={skillIds}
          />
          <span style={{ color: 'var(--tt-comment)' }}>
            Runs under <span style={{ color: 'var(--tt-teal)' }}>./evals-runs</span>. Pick one on
            the left.
          </span>
        </div>
      ) : (
        <div style={{ flex: 'none', padding: hasRuns ? '16px 16px 0' : 16 }}>
          <ReviewImportPanel createSampleRun={createSampleReviewRun} onImport={importRuns} />
        </div>
      )}
      {skillIds.length > 0 && !(env === 'localhost' && localhostSkillIds.length > 0) ? (
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid var(--tt-border)',
            display: 'flex',
            flex: 'none',
            gap: 8,
            padding: '9px 16px',
          }}
        >
          <span style={{ color: 'var(--tt-cyan)', fontSize: 12, fontWeight: 700 }}>
            {env}
          </span>
          <SkillPicker
            label="reviewing"
            onSelectSkill={setSelectedSkillId}
            selectedSkillId={selectedSkillId}
            skillIds={skillIds}
          />
        </div>
      ) : null}
      {hasRuns ? (
        <section
          aria-label="Review workspace"
          style={{
            display: 'flex',
            flex: 1,
            gap: 12,
            minHeight: 0,
            padding: 16,
          }}
        >
          <ReviewRuns runs={runs} selectedRunId={selectedRun.id} onSelectRun={setSelectedRunId} />
          <ReviewSummary
            run={selectedRun}
            selectedCaseId={selectedCaseId}
            onSelectCase={setSelectedCaseId}
          />
          <ReviewFeedbackImprove
            activeRunId={selectedRun.id}
            env={env}
            feedback={feedbackByRun.get(selectedRun.id) ?? []}
            improvePlans={improvePlansByRun.get(selectedRun.id) ?? []}
            onRecordFeedback={recordFeedback}
            onRemoveFeedback={removeFeedback}
            run={selectedRun}
            selectedCaseId={selectedCaseId}
          />
        </section>
      ) : null}
    </main>
  );
};
