import { GlobalHeader } from './components/GlobalHeader';
import { PrimitivesStory } from './components/primitives/__stories__/primitives';
import { SectionNav } from './components/SectionNav';
import { StatusBar } from './components/StatusBar';
import { ReviewApp } from './sections/review';
import { useSection } from './state/section';

const Main = () => {
  const { activeSection } = useSection();

  if (activeSection.name === 'review') {
    return <ReviewApp />;
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
      <GlobalHeader />
      <SectionNav />
      <Main />
      <StatusBar />
    </div>
  );
};
