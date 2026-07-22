import { sections, useSection } from '@/state/section';

export const SectionNav = () => {
  const { activeSection, setActiveSection } = useSection();

  return (
    <nav className="section-nav" aria-label="Sections" data-testid="section-nav">
      {sections.map((section) => (
        <button
          aria-current={activeSection.name === section.name ? 'page' : undefined}
          className="section-nav__tab"
          data-active={activeSection.name === section.name}
          key={section.name}
          onClick={() => setActiveSection(section)}
          type="button"
        >
          <span>{section.index}</span>
          {section.label}
        </button>
      ))}
    </nav>
  );
};
