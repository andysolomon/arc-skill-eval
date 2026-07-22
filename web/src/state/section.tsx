import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { SectionName } from '@/types';
import { getPrefs, setPrefs, subscribePrefs } from '@/persistence/preferences';

export type Section = {
  index: number;
  name: SectionName;
  label: string;
};

type SectionContextValue = {
  activeSection: Section;
  setActiveSection: (section: Section) => void;
};

export const sections: readonly Section[] = [
  { index: 1, name: 'run', label: 'run' },
  { index: 2, name: 'browse', label: 'browse' },
  { index: 3, name: 'create', label: 'create' },
  { index: 4, name: 'review', label: 'review' },
  { index: 5, name: 'learn', label: 'learn' },
] as const;

const defaultSection = sections[0];
const SectionContext = createContext<SectionContextValue | null>(null);

const findSection = (name: SectionName) =>
  sections.find((section) => section.name === name) ?? defaultSection;

export const SectionProvider = ({ children }: PropsWithChildren) => {
  const [activeSection, setActiveSection] = useState<Section>(defaultSection);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getPrefs().then((prefs) => {
      if (!cancelled) {
        setActiveSection(findSection(prefs.section));
        setHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return undefined;
    }

    void setPrefs({ section: activeSection.name });
    return subscribePrefs((prefs) => {
      setActiveSection(findSection(prefs.section));
    });
  }, [activeSection.name, hydrated]);

  const value = useMemo(
    () => ({ activeSection, setActiveSection }),
    [activeSection],
  );

  return <SectionContext.Provider value={value}>{children}</SectionContext.Provider>;
};

export const useSection = () => {
  const value = useContext(SectionContext);

  if (!value) {
    throw new Error('useSection must be used within SectionProvider');
  }

  return value;
};
