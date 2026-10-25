# Logout and appointment-change follow-up
Objective: Restore landing on logout, diagnose proposal failures, retain quick medical change-request summary and descending agenda.
Branch: jafet | Inline implementation after delegated read-only mapping | Runners: Python unittest, CRA tests/build.

## Specs
- S1: “Al cerrar sesión, que me mande directo a landing page.” Clear account state and show the landing.
- S2: “No me deja proponer el cambio de horario o fecha de cita.” Reproduce offline error handling; preserve working-day and occupancy safeguards, report actual failures inside the dialog.
- S3: “Al igual quiero que siga apareciendo asi de manera rapida en el panel medico la notificación de Solicitud de cambio (Revision requerida). Recuerdas que te pedi que la compusieras porque no se veia bien visualmente.” Retain a readable actionable summary; refresh without silently losing requests.
- S4: “En esta sección, que esta arriba aparezca la cita mas reciente.” In Agenda de pacientes, show appointment date/time descending, without changing nearest-upcoming selection.
- S5: “En calendario y citas al [Image #1] en esta sección al darle a la flecha, al ver la pantalla de detalle de la cita, tambien pueda cambiar el estado de la cita, (aprobado, pendiente, cancelado) y tambien pueda proponer horario.” Expose doctor-only status and proposal actions inside calendar appointment detail; approved maps to existing confirmada state.

## Tasks
- T1 S1: inline; complete; observed RED then GREEN logout regression.
- T2 S2–S4: inline after focused explorer; complete offline; backend/modal errors, 10-second independent request refresh with latest-request ordering, retained summary, descending agenda. Risk: items 3 and 4 (shared errors/modal and asynchronous ordering).
- T3 S5: inline; complete offline; doctor-only calendar status/proposal actions and regression tests.

## Log
- L1: Al cerrar sesión, que me mande directo a landing page. No me deja proponer el cambio de horario o fecha de cita. Al igual quiero que siga apareciendo asi de manera rapida en el panel medico la notificación de Solicitud de cambio (Revision requerida). Recuerdas que te pedi que la compusieras porque no se veia bien visualmente.
- L2: En esta sección, que esta arriba aparezca la cita mas reciente.
- L3: En calendario y citas al [Image #1] en esta sección al darle a la flecha, al ver la pantalla de detalle de la cita, tambien pueda cambiar el estado de la cita, (aprobado, pendiente, cancelado) y tambien pueda proponer horario.
- Existing staged/dirty work is preserved. Engram mirror unavailable: no registered runtime session. No production database access authorized. User previously allowed substitute exploration model gpt-6.1-sol. Screenshot shows ascending appointment times; interpret latest as appointment date/time descending, not creation timestamp.
- Explorer reproduced 20 offline workflow probes: valid proposals were wired, while SQL010 schedule errors became generic500 and doctor errors were hidden behind the modal. No SQL/availability guards were removed or changed.
- Observed RED: logout, agenda order, request refresh/error handling, and calendar actions regressions. GREEN: 34 backend tests and 12 frontend tests; CI production build successful. A ref-cleanup ESLint warning was fixed before final build.
- Isolated browser fixture (synthetic data, no actual account/backend) checked doctor summary and calendar modal at1440/390: no horizontal overflow. Status uses existing confirmada value for Aprobada. Proposal fields remain on failure; error shown inside dialog.
- Independent verifier passed S1/S3/S4/S5 and identified one S2 blocker: page error leaked between notification dialogs. One correction scoped action errors by appointment, cleared on open/close, keyed modal; new regression failed before fix and passed after. Independent bounded recheck closed blocker (two focused probes passed). Live Supabase proposal success not asserted; no new migration needed.
- Existing interdependent dirty/staged work prevents a safe isolated work-unit commit; no unrelated work committed. Native review remains pending on untracked-scope collection; no native review approval claimed. Engram mirror remains blocked by absent host identity.
