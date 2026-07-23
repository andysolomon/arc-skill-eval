import { useEffect } from 'react';

import { GlobalHeader } from './components/GlobalHeader';
import { PrimitivesStory } from './components/primitives/__stories__/primitives';
import { StatusBar } from './components/StatusBar';
import { BrowseApp } from './sections/browse';
import { CreateApp } from './sections/create';
import { LearnApp } from './sections/learn';
import { ReviewApp } from './sections/review';
import { RunApp } from './sections/run';
import { sections, useSection } from './state/section';

const Main = () => {
  const { activeSection } = useSection();

  if (activeSection.name === 'run') {
    return <RunApp />;
  }

  if (activeSection.name === 'review') {
    return <ReviewApp />;
  }

  if (activeSection.name === 'browse') {
    return <BrowseApp />;
  }

  if (activeSection.name === 'create') {
    return <CreateApp />;
  }

  if (activeSection.name === 'learn') {
    return <LearnApp />;
  }

  return (
    <main className="app-main" data-testid="app-main">
      <section className="workspace-shell" aria-labelledby="workspace-title">
        <div>
          <p className="workspace-kicker">section {activeSection.index}</p>
          <h1 id="workspace-title">{activeSection.label}</h1>
        </div>
        <p className="workspace-copy">
          This web shell is ready for the {activeSection.label} workspace.
        </p>
      </section>
    </main>
  );
};

const SectionHotkeys = () => {
  const { setActiveSection } = useSection();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }

      const index = Number.parseInt(event.key, 10);
      const section = sections.find((candidate) => candidate.index === index);
      if (section) {
        setActiveSection(section);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setActiveSection]);

  return null;
};

const shouldRenderPrimitivesStory = () =>
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  (window.location.pathname === '/_primitives' || window.location.hash === '#primitives');

export const App = () => {
  if (shouldRenderPrimitivesStory()) {
    return <PrimitivesStory />;
  }

  return (
    <div className="app-shell">
      <SectionHotkeys />
      <GlobalHeader />
      <Main />
      <StatusBar />
    </div>
  );
};
