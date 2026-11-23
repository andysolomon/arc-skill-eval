---
title: Web app
description: Review an imported run, draft an eval suite, and read the guide to skill evals in the hosted web app.
---

The hosted web app at [arc-skill-eval.vercel.app](https://arc-skill-eval.vercel.app) works next to the CLI. It can't run models, so you run evals with the CLI and use the app to read the results, draft suites, and learn the method. It needs no account.

## Review a run

Open **review** and import the JSON from a run. The app accepts the files a run writes, such as `grading.json`, `benchmark.json`, `timing.json`, `evals.json`, and `feedback.json`. You can also paste JSON from `arc-skill-eval`. The app checks each file and lists what it recognized before it loads the run.

After import, you can read each case's result and the with-skill and without-skill counts, then add notes about what to change. From those notes and the failed assertions, the app proposes changes to prompts, assertions, fixtures, or adjacent-negative cases. It downloads the plan as JSON and changes no files.

## Draft a suite

Open **create** to build an `evals/evals.json` file step by step. You list the behaviors the skill must show, write a prompt for each, and add checks to each case. The app shows the JSON as you build it. When the suite is complete, download the file and save it next to your skill's `SKILL.md`. Then run it with the CLI:

```bash
arc-skill-eval run ./skills/my-skill
```

The hosted app has no model, so it doesn't propose cases for you. Use `arc-skill-eval create --guided`, or ask an agent with the `arc-creating-evals` skill, when you want a model to draft the cases. See [Use it from an agent](/arc-skill-eval/agents/).

## Read the guide

Open **learn** for a guide to skill evals in seven chapters:

1. Overview
2. Anatomy of a skill
3. Creating an eval
4. Writing assertions
5. The with and without signal
6. Anatomy of a run
7. The Pi runtime

The guide covers the same ground as this site, with diagrams and worked examples.

## Your data stays in the browser

The app has no server-side storage and no sign-in. It keeps imported runs, notes, drafts, and your progress through the guide in your browser's IndexedDB. Nothing you import or type is uploaded. Clearing the site data in your browser deletes it.
