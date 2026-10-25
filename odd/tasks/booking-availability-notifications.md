# Booking availability and notifications
Objective: Enforce doctor working hours and occupied/reserved slots; notify the doctor atomically.
Branch: jafet | Route: inline after read-only delegated mapping | Checks: Python unittest, frontend build; isolated PostgreSQL proof if available.

## Specs
- S1: “Identifica los días que el medico descansa(no labora) que no me deje hacer la cita ese día. Que me mande un mensaje tipo, "Día no laboral".” Validate using the doctor's timezone and weekly blocks.
- S2: “Al igual que verifique y coteje al querer realizar una cita cuando ya este ocupado el espacio o esta otro paciente en espera de que el medico acepte.” Reject overlapping active/pending appointments and pending rescheduling reservations, including concurrent inserts.
- S3: “Al igual cuando llegue una nueva cita, llegue en notificaciones.” Insert the doctor's notification within the appointment transaction.

## Tasks
- T1 S1–S3: inline; implemented; 33 offline tests passed and frontend built; SQL execution pending. Risk: items 1 and 4 (schema and concurrent reservation protection).
- T2 S1–S3: independent static/offline verification complete; real PostgreSQL/concurrency proof pending because local Docker is offline.

## Log
- L1: Identifica los días que el medico descansa(no labora) que no me deje hacer la cita ese día. Que me mande un mensaje tipo, "Día no laboral". Al igual que verifique y coteje al querer realizar una cita cuando ya este ocupado el espacio o esta otro paciente en espera de que el medico acepte. Al igual cuando llegue una nueva cita, llegue en notificaciones.
- Read-only explorer confirmed creation bypasses availability. Pending change states are pendiente, pendiente_paciente, pendiente_medico. Existing appointments without a type use a 30-minute fallback; typed appointments retain their configured duration.
- User authorized gpt-6.1-sol instead of unavailable gpt-6.1-luna. Mapping completed; parent owns implementation. Existing dirty/staged work is preserved. Engram mirror unavailable because host session has no registered identity. Forecast: approximately 350 authored lines; no remote database access authorized.
- Observed RED: new atomic-booking/error tests failed against the direct-insert route (four failures). GREEN: full backend suite 33 tests OK; npm run build compiled. New migration010 guards appointments and pending proposals using a common doctor-row lock; notifications insert in the same transaction. Booking now requires the RPC, refusing unsafe fallback if migration is absent. Notifications refresh every 30 seconds.
- Local SQL integration unavailable: psql absent, local Docker named pipe offline. No production SQL executed. Independent verifier running. Migration must precede backend activation. Default appointment duration is 30 minutes when no appointment type is supplied.
- Existing staged/dirty changes predate this feature and are interdependent; no mixed work-unit commit was created. Prior whole-workspace native review exceeded its context budget. A separately bounded candidate remains necessary; no native review approval is claimed.
- Independent verifier: no concrete change-caused blocker found; static passes S1/S2/S3, 33 offline tests, two RPC route probes, and notification polling probe passed. No PostgreSQL parser/server validated SQL; actual migration, two-session races, acceptance, and notification rollback still need isolated PostgreSQL. Parent focused checks passed. Do not deploy the backend without migration010; the RPC intentionally fails closed before installation.
