------------------------------ MODULE RunConsole ------------------------------
(*****************************************************************************)
(* The TUI run console and the runs it starts.                               *)
(*                                                                           *)
(*   src/tui/RunConsole.tsx  useRunController: start, close, cancel, the     *)
(*                           emit callback, the reducer, the clock effect    *)
(*   src/tui/run-driver.ts   runInProcess: init, then done, error or         *)
(*                           cancelled                                       *)
(*   src/tui/app.tsx         which key calls start, cancel or close          *)
(*                                                                           *)
(* Each action is one synchronous JavaScript turn: a key handler, or the     *)
(* code between two awaits in runInProcess. React applies a dispatch and     *)
(* the clock effect it triggers before the next turn.                        *)
(*                                                                           *)
(* A `\* code:` line names a file and text that must be in it. Run           *)
(* `npm run verify:formal`; it fails when that text is gone.                 *)
(*****************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    MaxRuns,            \* how many runs the user starts in one behavior
    GuardGeneration,    \* emit drops an event unless generation.current === gen
    UseAbortController, \* start, close and cancel abort controller.current
    ResetClock          \* start calls setElapsed(0)

NoRun == 0

\* Run ids are values of generation.current. start and close each add one,
\* and each close needs an init since the last reset, so 2 * MaxRuns is enough.
Gens == 1..(2 * MaxRuns)

VARIABLES
    generation, \* generation.current
    controller, \* the run whose AbortController controller.current holds; NoRun for null
    aborted,    \* aborted[g]: run g's ac.signal.aborted
    run,        \* run[g]: where runInProcess for run g is
    console,    \* the reducer's RunState
    clock,      \* the run whose init started the clock interval; NoRun while it is stopped
    elapsedOf,  \* the run whose clock last set elapsed; NoRun after setElapsed(0)
    current     \* not in the code: the run the user started last, until they close the console

vars == <<generation, controller, aborted, run, console, clock, elapsedOf, current>>

\* reading: awaiting readEvalsJson. running: awaiting runEvalsCommand.
Phases == {"unstarted", "reading", "running", "ended"}

\* initialRun, plus `from`, which is not in the code: the runs whose events
\* the reducer applied since the console was last reset.
InitialRun == [active |-> FALSE, done |-> FALSE, cancelling |-> FALSE,
               cancelled |-> FALSE, error |-> FALSE, from |-> {}]

TypeOK ==
    /\ generation \in 0..(2 * MaxRuns)
    /\ controller \in Gens \cup {NoRun}
    /\ aborted \in [Gens -> BOOLEAN]
    /\ run \in [Gens -> Phases]
    /\ console \in [active : BOOLEAN, done : BOOLEAN, cancelling : BOOLEAN,
                    cancelled : BOOLEAN, error : BOOLEAN, from : SUBSET Gens]
    /\ clock \in Gens \cup {NoRun}
    /\ elapsedOf \in Gens \cup {NoRun}
    /\ current \in Gens \cup {NoRun}

Init ==
    /\ generation = 0
    /\ controller = NoRun
    /\ aborted = [g \in Gens |-> FALSE]
    /\ run = [g \in Gens |-> "unstarted"]
    /\ console = InitialRun
    /\ clock = NoRun
    /\ elapsedOf = NoRun
    /\ current = NoRun

-----------------------------------------------------------------------------
(* The reducer and the clock effect, src/tui/RunConsole.tsx *)

\* code: src/tui/RunConsole.tsx: case 'init': return { ...initialRun, active: true,
\* code: src/tui/RunConsole.tsx: case 'done': return { ...state, done: true,
\* code: src/tui/RunConsole.tsx: case 'error': return { ...state, done: true, error: ev.message };
\* code: src/tui/RunConsole.tsx: case 'cancelled': return { ...state, done: true, cancelling: false, cancelled: true,
Reduce(c, ev, g) ==
    LET next == CASE ev = "init"      -> [InitialRun EXCEPT !.active = TRUE]
                  [] ev = "done"      -> [c EXCEPT !.done = TRUE]
                  [] ev = "error"     -> [c EXCEPT !.done = TRUE, !.error = TRUE]
                  [] ev = "cancelled" -> [c EXCEPT !.done = TRUE, !.cancelling = FALSE,
                                                   !.cancelled = TRUE]
    IN [next EXCEPT !.from = c.from \cup {g}]

\* The clock effect runs while the console is active and not done. It
\* restarts, taking a new t0, only when that condition turns true.
\* code: src/tui/RunConsole.tsx: if (!state.active || state.done) return; t0.current = Date.now();
\* code: src/tui/RunConsole.tsx: }, [state.active, state.done]);
ClockRuns(c) == c.active /\ ~c.done

Dispatch(ev, g) ==
    LET c == Reduce(console, ev, g) IN
    /\ console' = c
    /\ clock' = IF ~ClockRuns(c) THEN NoRun
                ELSE IF ClockRuns(console) THEN clock
                ELSE g

\* The callback start() hands to runInProcess.
\* code: src/tui/RunConsole.tsx: void runInProcess(req, (ev) => { if (generation.current === gen) dispatch(ev); }, ac.signal);
Emit(ev, g) ==
    IF ~GuardGeneration \/ generation = g
    THEN Dispatch(ev, g)
    ELSE UNCHANGED <<console, clock>>

\* controller.current?.abort()
AbortCurrent ==
    aborted' = [g \in Gens |-> aborted[g] \/ (UseAbortController /\ g = controller)]

-----------------------------------------------------------------------------
(* What the user does, src/tui/app.tsx *)

\* r or R, or the run options form, while the console is not on screen.
\* code: src/tui/app.tsx: if (runCtl.state.active) {
\* code: src/tui/app.tsx: if (input === 'r') { runCtl.start(
\* code: src/tui/RunConsole.tsx: controller.current?.abort(); const ac = new AbortController(); controller.current = ac; const gen = ++generation.current; setElapsed(0); dispatch({ type: 'reset' });
Start ==
    /\ ~console.active
    /\ Cardinality({g \in Gens : run[g] /= "unstarted"}) < MaxRuns
    /\ LET g == generation + 1 IN
       /\ AbortCurrent
       /\ controller' = IF UseAbortController THEN g ELSE NoRun
       /\ generation' = g
       /\ elapsedOf' = IF ResetClock THEN NoRun ELSE elapsedOf
       /\ console' = InitialRun
       /\ clock' = NoRun
       /\ run' = [run EXCEPT ![g] = "reading"]
       /\ current' = g

\* close(): abort, null the controller, bump the generation, reset.
\* code: src/tui/RunConsole.tsx: const close = () => { controller.current?.abort(); controller.current = null; generation.current++; dispatch({ type: 'reset' }); };
DoClose ==
    /\ AbortCurrent
    /\ controller' = NoRun
    /\ generation' = generation + 1
    /\ console' = InitialRun
    /\ clock' = NoRun
    /\ current' = NoRun
    /\ UNCHANGED <<run, elapsedOf>>

\* Enter or esc once the run has ended.
\* code: src/tui/app.tsx: if (runCtl.state.done && (key.return || key.escape)) { runCtl.close();
Close ==
    /\ console.active /\ console.done
    /\ DoClose

\* Esc while the run is going: cancel(). The first esc aborts the run and
\* waits for it. A second esc, or no controller, closes now.
\* code: src/tui/app.tsx: else if (!runCtl.state.done && key.escape) runCtl.cancel();
\* code: src/tui/RunConsole.tsx: const ac = controller.current; if (!ac || ac.signal.aborted) { close(); return; } ac.abort(); dispatch({ type: 'cancelling' });
Cancel ==
    /\ console.active /\ ~console.done
    /\ IF controller = NoRun \/ aborted[controller]
       THEN DoClose
       ELSE /\ aborted' = [aborted EXCEPT ![controller] = TRUE]
            /\ console' = [console EXCEPT !.cancelling = TRUE]
            /\ UNCHANGED <<generation, controller, run, clock, elapsedOf, current>>

-----------------------------------------------------------------------------
(* What a run does, runInProcess in src/tui/run-driver.ts *)

\* readEvalsJson settles (or throws, which is caught), then init.
\* code: src/tui/run-driver.ts: emit({ type: 'init', skill: skillName,
SuiteRead(g) ==
    /\ run[g] = "reading"
    /\ run' = [run EXCEPT ![g] = "running"]
    /\ Emit("init", g)
    /\ UNCHANGED <<generation, controller, aborted, elapsedOf, current>>

\* runEvalsCommand settles. Not aborted: done, or error. Aborted: cancelled,
\* or still done or error when the abort came after executeEvalRun checked
\* the signal (or with no cases, which reports error without checking it).
\* code: src/tui/run-driver.ts: emit({ type: 'done', passed: result.summary.passedCases,
\* code: src/tui/run-driver.ts: if (error instanceof EvalRunCancelledError || signal?.aborted) { emit({ type: 'cancelled' }); return; }
\* code: src/evals/eval-run/execute.ts: if (options.signal?.aborted) { throw new EvalRunCancelledError(); }
Endings(g) == IF aborted[g] THEN {"done", "error", "cancelled"} ELSE {"done", "error"}

RunEnds(g, ev) ==
    /\ run[g] = "running"
    /\ ev \in Endings(g)
    /\ run' = [run EXCEPT ![g] = "ended"]
    /\ Emit(ev, g)
    /\ UNCHANGED <<generation, controller, aborted, elapsedOf, current>>

\* The clock interval fires: setElapsed((Date.now() - t0.current) / 1000).
\* code: src/tui/RunConsole.tsx: const clock = setInterval(() => setElapsed((Date.now() - t0.current) / 1000), 100);
Tick ==
    /\ clock /= NoRun
    /\ elapsedOf /= clock
    /\ elapsedOf' = clock
    /\ UNCHANGED <<generation, controller, aborted, run, console, clock, current>>

\* Every run has ended and the console is closed: nothing is left to happen.
Settled ==
    /\ ~console.active
    /\ \A g \in Gens : run[g] \in {"unstarted", "ended"}
    /\ Cardinality({g \in Gens : run[g] /= "unstarted"}) = MaxRuns
    /\ UNCHANGED vars

Next ==
    \/ Start
    \/ Cancel
    \/ Close
    \/ \E g \in Gens : SuiteRead(g)
    \/ \E g \in Gens, ev \in {"done", "error", "cancelled"} : RunEnds(g, ev)
    \/ Tick
    \/ Settled

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Rules *)

\* The console on screen shows only events from the run the user started
\* last. Broken by 7b99dd9: a closed run's late done marked the next run
\* complete.
ConsoleShowsCurrentRun ==
    console.active => console.from \subseteq {current}

\* Every run the console no longer shows has been told to stop. Broken by
\* 7b99dd9: esc only hid the console, and the run kept calling the model.
ClosedRunsStop ==
    \A g \in Gens : run[g] \in {"reading", "running"} /\ g /= current => aborted[g]

\* The elapsed time on screen is zero or was measured for the run on screen.
\* Broken by c08b456: a run that failed before its first tick showed the
\* previous run's time.
ClockShowsCurrentRun ==
    console.active => elapsedOf \in {NoRun, current}

=============================================================================
