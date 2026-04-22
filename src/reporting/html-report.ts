import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ArcSkillEvalJsonReport } from "./types.js";

export function renderHtmlReport(report: ArcSkillEvalJsonReport): string {
  const invalidSkillsHtml = report.invalidSkills.length
    ? `<section><h2>Invalid skills</h2>${report.invalidSkills
        .map(
          (skill) => `<article class="card">
              <h3>${escapeHtml(skill.skill)}</h3>
              <p><code>${escapeHtml(skill.relativeSkillDir)}</code></p>
              <ul>${skill.issues
                .map(
                  (issue) =>
                    `<li><strong>${escapeHtml(issue.path)}</strong> — ${escapeHtml(issue.code)} — ${escapeHtml(issue.message)}</li>`,
                )
                .join("")}</ul>
            </article>`,
        )
        .join("")}</section>`
    : "";

  const skillCardsHtml = report.skills
    .map(
      (skill) => `<article class="card">
          <h2>${escapeHtml(skill.skill)}</h2>
          <p>
            <strong>Status:</strong> ${escapeHtml(skill.status)}<br />
            <strong>Profile:</strong> ${escapeHtml(skill.profile)}<br />
            <strong>Target tier:</strong> ${skill.targetTier}<br />
            <strong>Overall score:</strong> ${formatNumber(skill.lanes.overall.scorePercent)}
          </p>
          <h3>Lane summaries</h3>
          <table>
            <thead>
              <tr><th>Lane</th><th>Status</th><th>Score</th><th>Threshold</th></tr>
            </thead>
            <tbody>
              ${renderLaneRow("routing", skill.lanes.routing)}
              ${renderLaneRow("execution", skill.lanes.execution)}
              ${renderLaneRow("overall", skill.lanes.overall)}
            </tbody>
          </table>
          <h3>Scored cases</h3>
          <table>
            <thead>
              <tr><th>Case</th><th>Lane</th><th>Status</th><th>Execution</th><th>Score</th><th>Trace</th></tr>
            </thead>
            <tbody>
              ${skill.cases
                .map(
                  (caseEntry) => `<tr>
                    <td><code>${escapeHtml(caseEntry.caseId)}</code></td>
                    <td>${escapeHtml(caseEntry.lane)}</td>
                    <td>${escapeHtml(caseEntry.status)}</td>
                    <td>${escapeHtml(caseEntry.executionStatus)}</td>
                    <td>${formatNumber(caseEntry.scorePercent)}</td>
                    <td><code>${escapeHtml(caseEntry.traceRef)}</code></td>
                  </tr>`,
                )
                .join("")}
            </tbody>
          </table>
          ${skill.unscoredCases.length ? `<h3>Unscored cases</h3>
          <table>
            <thead>
              <tr><th>Case</th><th>Lane</th><th>Status</th><th>Execution</th><th>Reason</th><th>Trace</th></tr>
            </thead>
            <tbody>
              ${skill.unscoredCases
                .map(
                  (caseEntry) => `<tr>
                    <td><code>${escapeHtml(caseEntry.caseId)}</code></td>
                    <td>${escapeHtml(caseEntry.lane)}</td>
                    <td>${escapeHtml(caseEntry.status)}</td>
                    <td>${escapeHtml(caseEntry.executionStatus)}</td>
                    <td>${escapeHtml(caseEntry.reason)}</td>
                    <td><code>${escapeHtml(caseEntry.traceRef)}</code></td>
                  </tr>`,
                )
                .join("")}
            </tbody>
          </table>` : ""}
        </article>`,
    )
    .join("");

  const traceDetailsHtml = report.traces
    .map(
      (trace) => `<details class="card">
          <summary>${escapeHtml(trace.traceId)} — ${escapeHtml(trace.skill)} / ${escapeHtml(trace.caseId)}</summary>
          <p>
            <strong>Lane:</strong> ${escapeHtml(trace.lane)}<br />
            <strong>Duration:</strong> ${trace.timing.durationMs} ms<br />
            <strong>Session:</strong> ${escapeHtml(trace.raw.sessionId)}
          </p>
          <pre>${escapeHtml(JSON.stringify({ identity: trace.identity, timing: trace.timing, observations: trace.observations, raw: trace.raw }, null, 2))}</pre>
        </details>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>arc-skill-eval report ${escapeHtml(report.runId)}</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; margin: 2rem; line-height: 1.5; }
      h1, h2, h3 { margin-bottom: 0.5rem; }
      .meta, .card { border: 1px solid #9994; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
      th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #9994; vertical-align: top; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      pre { overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
    </style>
  </head>
  <body>
    <header class="meta">
      <h1>arc-skill-eval report</h1>
      <p>
        <strong>Run:</strong> <code>${escapeHtml(report.runId)}</code><br />
        <strong>Status:</strong> ${escapeHtml(report.status)}<br />
        <strong>Generated:</strong> ${escapeHtml(report.generatedAt)}<br />
        <strong>Source:</strong> ${escapeHtml(report.source.displayName)} (${escapeHtml(report.source.kind)})
      </p>
    </header>

    <section class="card">
      <h2>Summary</h2>
      <table>
        <tbody>
          <tr><th>Discovered skills</th><td>${report.summary.discoveredSkillCount}</td></tr>
          <tr><th>Valid skills</th><td>${report.summary.validSkillCount}</td></tr>
          <tr><th>Invalid skills</th><td>${report.summary.invalidSkillCount}</td></tr>
          <tr><th>Scored skills</th><td>${report.summary.scoredSkillCount}</td></tr>
          <tr><th>Scored cases</th><td>${report.summary.caseCount}</td></tr>
          <tr><th>Unscored cases</th><td>${report.summary.unscoredCaseCount}</td></tr>
          <tr><th>Executed cases</th><td>${report.summary.executedCaseCount}</td></tr>
          <tr><th>Passed scored cases</th><td>${report.summary.passedCaseCount}</td></tr>
          <tr><th>Failed scored cases</th><td>${report.summary.failedCaseCount}</td></tr>
        </tbody>
      </table>
    </section>

    ${report.runIssues.length ? `<section><h2>Run issues</h2><ul>${report.runIssues
      .map((issue) => `<li><strong>${escapeHtml(issue.severity)}</strong> — ${escapeHtml(issue.code)} — ${escapeHtml(issue.message)}</li>`)
      .join("")}</ul></section>` : ""}

    ${invalidSkillsHtml}

    <section>
      <h2>Scored skills</h2>
      ${skillCardsHtml}
    </section>

    <section>
      <h2>Traces</h2>
      ${traceDetailsHtml}
    </section>
  </body>
</html>
`;
}

export async function writeHtmlReport(
  report: ArcSkillEvalJsonReport,
  outputPath: string,
): Promise<string> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderHtmlReport(report), "utf8");
  return outputPath;
}

function renderLaneRow(
  name: string,
  lane: ArcSkillEvalJsonReport["skills"][number]["lanes"]["overall"],
): string {
  return `<tr>
    <td>${escapeHtml(name)}</td>
    <td>${escapeHtml(lane.status)}</td>
    <td>${formatNumber(lane.scorePercent)}</td>
    <td>${formatNumber(lane.thresholdPercent)}</td>
  </tr>`;
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
