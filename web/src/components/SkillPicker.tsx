type SkillPickerProps = {
  label: 'browsing' | 'reviewing';
  onSelectSkill: (skillId: string) => void;
  selectedSkillId?: string;
  skillIds: string[];
};

export const SkillPicker = ({
  label,
  onSelectSkill,
  selectedSkillId,
  skillIds,
}: SkillPickerProps) => (
  <div
    aria-label={`${label} skill`}
    role="group"
    style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}
  >
    <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>{label}:</span>
    {skillIds.map((skillId) => {
      const selected = skillId === selectedSkillId;

      return (
        <button
          aria-pressed={selected}
          data-testid={`${label}-skill-${skillId}`}
          key={skillId}
          onClick={() => onSelectSkill(skillId)}
          type="button"
          style={{
            background: selected
              ? 'color-mix(in srgb, var(--tt-teal) 14%, var(--tt-bg))'
              : 'transparent',
            border: `1px solid ${selected ? 'var(--tt-teal)' : 'var(--tt-border)'}`,
            borderRadius: 6,
            color: selected ? 'var(--tt-teal)' : 'var(--tt-fg-dark)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '5px 11px',
          }}
        >
          {skillId}
        </button>
      );
    })}
  </div>
);
