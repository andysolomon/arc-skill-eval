import { GlobalHeader } from './components/GlobalHeader';
import { SectionNav } from './components/SectionNav';
import { StatusBar } from './components/StatusBar';
import { useSection } from './state/section';

const Main = () => {
  const { activeSection } = useSection();

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

export const App = () => (
  <div className="app-shell">
    <GlobalHeader />
    <SectionNav />
    <Main />
    <StatusBar />
  </div>
);
