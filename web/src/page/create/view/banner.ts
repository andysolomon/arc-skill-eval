import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { WorkspaceSkill } from '@/app/context';
import { sx } from '@/ui/sx';

import { ASSIST_MODEL_OPTIONS } from '../domain';
import { Message } from '../message';
import type { Banner, BannerResult, Model } from '../model';
import { spacer, tinted } from './common';

// HOSTED

export const hostedBanner = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderLeft: '2px solid var(--tt-cyan)',
          borderRadius: 8,
          marginBottom: 20,
          padding: '11px 14px',
        }),
      ),
    ],
    [
      h.span([h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 12.5, fontWeight: 700 }))], ['Create on the hosted site']),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55, marginTop: 4 }))],
        [
          'Build the suite below, then download',
          ' ',
          tinted('evals.json', 'var(--tt-fg-dark)', h),
          '. On',
          ' ',
          tinted('localhost', 'var(--tt-fg-dark)', h),
          ',',
          ' ',
          tinted('create --guided', 'var(--tt-fg-dark)', h),
          ' can draft a suite from an existing SKILL.md.',
        ],
      ),
    ],
  );

// LOCALHOST

const skillChip = (skill: WorkspaceSkill, isSelected: boolean, h: HtmlBuilder<Message>): Html =>
  h.keyed('button')(
    skill.id,
    [
      h.AriaPressed(String(isSelected)),
      h.OnClick(Message.ClickedSkillChip({ skillId: skill.id })),
      h.Type('button'),
      ...(skill.hasEvals ? [h.Title('already has an eval suite; you can edit it')] : []),
      h.Style(
        sx({
          alignItems: 'center',
          background: isSelected ? 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))' : 'transparent',
          border: `1px solid ${isSelected ? 'var(--tt-green)' : 'var(--tt-border)'}`,
          borderRadius: 6,
          color: isSelected ? 'var(--tt-green)' : 'var(--tt-fg-dark)',
          cursor: 'pointer',
          display: 'inline-flex',
          fontSize: 12,
          gap: 6,
          padding: '5px 11px',
        }),
      ),
    ],
    [
      skill.hasEvals
        ? h.span([h.AriaLabel('has evals'), h.Style(sx({ color: 'var(--tt-green)', flex: 'none', fontSize: 8 }))], ['●'])
        : h.empty,
      skill.id,
    ],
  );

const actionLabel = (banner: Banner, isEdit: boolean): string => {
  if (banner.activity._tag === 'LoadingEvals') {
    return '✎ loading…';
  }
  if (banner.activity._tag === 'Generating') {
    return '✦ generating…';
  }
  return isEdit ? '✎ Edit existing evals' : '✦ Draft evals';
};

const resultNotice = (content: ReadonlyArray<Html | string>, h: HtmlBuilder<Message>): Html =>
  h.div([h.Style(sx({ color: 'var(--tt-green)', fontSize: 12, marginTop: 10 }))], content);

const errorNotice = (error: string, h: HtmlBuilder<Message>): Html =>
  h.div([h.Role('alert'), h.Style(sx({ color: 'var(--tt-red)', fontSize: 12, marginTop: 10 }))], ['✗ ', error]);

const optionalNotice = <A>(maybe: Option.Option<A>, render: (value: A) => Html, h: HtmlBuilder<Message>): Html =>
  Option.match(maybe, { onNone: () => h.empty, onSome: render });

const nonEmpty = (maybe: Option.Option<string>): Option.Option<string> => Option.filter(maybe, (value) => value !== '');

const draftedNotice = (result: BannerResult, h: HtmlBuilder<Message>): Html =>
  resultNotice(
    [
      '✓ Drafted ',
      String(result.count),
      ' behaviors from',
      ' ',
      tinted(result.skill, 'var(--tt-teal)', h),
      '. Review each behavior, or add more by hand.',
    ],
    h,
  );

const loadedNotice = (result: BannerResult, h: HtmlBuilder<Message>): Html =>
  resultNotice(
    [
      '✓ Loaded ',
      String(result.count),
      ' cases from',
      ' ',
      tinted(result.skill, 'var(--tt-teal)', h),
      "'s evals.json. Edit the cases, then write the file again.",
    ],
    h,
  );

const assistModelRow = (assistModel: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }))],
    [
      h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12 }))], ['✦ Assist model:']),
      h.select(
        [
          h.AriaLabel('assist model'),
          h.OnChange((value) => Message.SelectedAssistModel({ value })),
          h.Value(assistModel),
          h.Style(
            sx({
              background: 'var(--tt-bg)',
              border: '1px solid var(--tt-border)',
              borderRadius: 6,
              color: 'var(--tt-fg-dark)',
              cursor: 'pointer',
              fontSize: 12,
              maxWidth: '100%',
              padding: '5px 8px',
            }),
          ),
        ],
        Array.map(ASSIST_MODEL_OPTIONS, (option) =>
          h.keyed('option')(option, [h.Value(option), h.Selected(option === assistModel)], [option]),
        ),
      ),
    ],
  );

export const generateBanner = (model: Model, skills: ReadonlyArray<WorkspaceSkill>, h: HtmlBuilder<Message>): Html => {
  const { banner } = model;
  const maybeSelectedSkill = Option.flatMap(banner.maybeSelectedSkillId, (skillId) =>
    Array.findFirst(skills, (skill) => skill.id === skillId),
  );
  const isEdit = Option.exists(maybeSelectedSkill, (skill) => skill.hasEvals);
  const isActive = Option.isSome(banner.maybeSelectedSkillId) && banner.activity._tag === 'Idle';
  const accent = isEdit ? 'var(--tt-blue)' : 'var(--tt-green)';

  return h.div(
    [
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderLeft: '2px solid var(--tt-green)',
          borderRadius: 8,
          marginBottom: 20,
          padding: '12px 14px',
        }),
      ),
    ],
    [
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }))],
        [
          h.span([h.Style(sx({ color: 'var(--tt-green)', fontSize: 12.5, fontWeight: 700 }))], ['Draft an eval suite']),
          h.span(
            [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11.5, lineHeight: 1.5 }))],
            [
              'Choose a skill to draft behaviors, prompts, and assertions with an LLM (',
              tinted('create --guided', 'var(--tt-fg-dark)', h),
              '). You can also build the suite by hand.',
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }))],
        [
          h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12 }))], ['Skill:']),
          ...Array.map(skills, (skill) =>
            skillChip(skill, Option.contains(banner.maybeSelectedSkillId, skill.id), h),
          ),
          spacer(h),
          h.button(
            [
              h.Disabled(!isActive),
              h.OnClick(isEdit ? Message.ClickedEditExistingEvals() : Message.ClickedDraftEvals()),
              h.Type('button'),
              h.Style(
                sx({
                  alignItems: 'center',
                  background: 'transparent',
                  border: `1px solid ${isActive ? accent : 'var(--tt-border)'}`,
                  borderRadius: 6,
                  color: isActive ? accent : 'var(--tt-dim)',
                  cursor: isActive ? 'pointer' : 'default',
                  display: 'inline-flex',
                  fontSize: 12.5,
                  fontWeight: 700,
                  gap: 6,
                  padding: '6px 13px',
                }),
              ),
            ],
            [actionLabel(banner, isEdit)],
          ),
        ],
      ),
      optionalNotice(banner.maybeDrafted, (result) => draftedNotice(result, h), h),
      optionalNotice(banner.maybeLoaded, (result) => loadedNotice(result, h), h),
      optionalNotice(nonEmpty(banner.maybeDraftError), (error) => errorNotice(error, h), h),
      optionalNotice(nonEmpty(banner.maybeLoadError), (error) => errorNotice(error, h), h),
      assistModelRow(model.assistModel, h),
    ],
  );
};
