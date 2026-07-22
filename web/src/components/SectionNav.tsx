import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { SectionName } from '@/types';

type Section = {
  index: number;
  name: SectionName;
  label: string;
};

type SectionContextValue = {
  activeSection: Section;
  setActiveSection: (section: Section) => void;
};

const sections: readonly Section[] = [
  { index: 1, name: 'run', label: 'run' },
  { index: 2, name: 'browse', label: 'browse' },
  { index: 3, name: 'create', label: 'create' },
  { index: 4, name: 'review', label: 'review' },
  { index: 5, name: 'learn', label: 'learn' },
] as const;

const SectionContext = createContext<SectionContextValue | null>(null);

export const SectionProvider = ({ children }: PropsWithChildren) => {
  const [activeSection, setActiveSection] = useState<Section>(sections[0]);
  const value = useMemo(() => ({ activeSection, setActiveSection }), [activeSection]);

  return <SectionContext.Provider value={value}>{children}</SectionContext.Provider>;
};

export const useSection = () => {
  const value = useContext(SectionContext);

  if (!value) {
    throw new Error('useSection must be used within SectionProvider');
  }

  return value;
};

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
