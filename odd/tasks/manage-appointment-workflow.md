# Appointment workflow
Branch: jafet
Objective: Add secure appointment statuses and physician-approved patient rescheduling.
Delivery: inline work units; no commit requested by user.
Test runner: Python unittest with isolated Flask/Supabase mocks; frontend `npm run build`.

## Specs

### S1 — Appointment status workflow
Authorized user request: "Quiero que desde el panel del medico, pueda poner diferentes estados a las citas, ya sea confirmada, pendienrte, cancelada, reprogramada, etc."
Acceptance: physician can apply the supported statuses to assigned appointments only; invalid transitions and foreign appointments are rejected without mutation. Initial vocabulary is `pendiente`, `confirmada`, `cancelada`, `reprogramada`, `rechazada`.
Checks: route tests for authorization, valid transitions, invalid status, and unchanged data on rejection.

### S2 — Patient change request
Authorized user request: "Al igual que el paciente pueda editar la cita, por si se equivoco de fecha, hora o doctor."
Acceptance: patient may request date, time, or physician changes for an owned active appointment. The original appointment remains active while the request is pending.
Checks: ownership, input validation, and request persistence tests.

### S3 — Availability and reservation
Authorized user request: "para el paciente antes de cambiar hora o fecha o doctor, debe checar la base de datos que no este ocupado ese espacio por ese paciente, se dia libre del doctor."
Additional decision: "si, debe quedar reservada."
Acceptance: requested slot must be available for the selected physician and must not overlap another active appointment or active pending request. A pending request reserves the proposed slot until accepted or rejected. Patient double-booking is rejected.
Checks: overlap, cancellation release, doctor change, timezone, and concurrent-request behavior where the persistence layer permits it.

### S4 — Physician acceptance
Authorized user request: "Al igual pues el medico debe aceptar."
Acceptance: only the physician assigned to the proposed appointment may accept or reject a pending change. Accepting atomically replaces the appointment details and marks it `confirmada`/`reprogramada`; rejecting preserves the original appointment and releases the reserved proposed slot.
Checks: assigned-physician authorization, accept/reject state transitions, and stale-request handling.

Assumption: pending change requests are stored separately from the appointment so the original booking remains intact until physician acceptance. Pending requests reserve the proposed slot.

## Tasks
- T1 S1-S4: Add schema migration and backend state machine, ownership checks, availability validation, reservation, and accept/reject endpoints. Route: inline. Status: reopened; acceptance failed because the deployed cita status constraint may reject `reprogramada`; migration 006 now preserves existing checks while allowing this state. Commit: none.
- T2 S1-S4: Add backend isolated public-route tests covering the workflow and rejected-state invariants. Route: inline. Status: partial; offline validation and migration contract tests added, full Supabase RPC integration remains pending until migration is applied. Commit: none.
- T3 S2-S4: Add patient edit/request UI and physician status/accept/reject controls; update calendar refresh and status presentation. Route: inline. Status: complete. Commit: none.
- T4 S1-S4: Run focused backend tests, frontend build, and diff review. Route: inline. Status: complete; Python checks, four focused tests, frontend build, and impeccable detect passed. Commit: none.

## Log

L1: "Quiero que desde el panel del medico, pueda poner diferentes estados a las citas, ya sea confirmada, pendienrte, cancelada, reprogramada, etc. Al igual que el paciente pueda editar la cita, por si se equivoco de fecha, hora o doctor. Obviamente para el paciente antes de cambiar hora o fecha o doctor, debe checar la base de datos que no este ocupado ese espacio por ese paciente, se dia libre del doctor. Al igual pues el medico debe aceptar."
L2: User confirmed: a patient-proposed slot remains reserved while the physician decides; rejection preserves the original appointment and releases the requested slot.
L3: Implemented separate pending change requests so the original appointment remains active; the proposed slot is reserved by the database RPC and released on rejection, cancellation, or physician rejection of the original appointment.
L4: Verification: `python -B -m unittest discover -s backend/tests -p 'test_appointment_workflow.py' -v` passed 4 tests; `python -m py_compile backend/app.py` passed; `npm run build` passed; `impeccable detect --json` returned no findings. The migration still must be applied in Supabase before enabling the new endpoints.
L5: User requested that patient and physician appointment actions open a full detail view instead of cancelling directly; implemented reusable detail modal with patient/physician, date, time, specialty, status, motive, and cancellation action inside the detail view.
L6: User reports acceptance fails for both patient-response and physician-request flows, while reject/counterproposal work. Both acceptance RPCs set `citas.estado = 'reprogramada'`; migration 006 extends the current enum or check constraint without discarding existing values. The physician change-request row also used the generic appointment grid, forcing content into its narrow rail/avatar columns; replaced it with dedicated responsive layout showing patient and old/new time.
