# Apply the audited appointment workflow

Migration `011_audit_workflow_fixes.sql` makes appointment status changes and proposal resolution transactional. The Flask routes require it and never fall back to direct updates or the old, unguarded implementations. This work does not register the clinical module; that integration and migration 012 are separate.

## Deployment path

1. Back up the database and review existing pending requests, including overlaps and invalid physician/type references. Stop appointment writes during deployment.
2. Apply migrations through 010, then apply 011 as one transaction using an explicitly authorized administrative connection. No database connection or migration execution was performed as part of the offline tests.
3. Reload the PostgREST schema cache according to your deployment procedure, then deploy the matching Flask backend and frontend callers. Only the backend's `service_role` client may execute the mutation functions; never expose its key to a browser.
4. Verify authorization, typed transfers, cancellation, completed appointments, and two-session races in an isolated staging database before enabling writes. Deploy 012 before expecting non-null attended-person identities from the clinical module.

The local Python entrypoint uses `debug=False`. It remains a development server, **not** a production WSGI deployment. Use your configured production server without Flask debug/reloader or public tracebacks. Login no longer prints identifiers, emails, upstream authentication exceptions, or tracebacks. Existing legacy authentication/migration behavior is otherwise unchanged.

## API contract

| Operation | Request / behavior |
| --- | --- |
| `POST /api/chat` | Bearer token and JSON `{ "mensaje": "..." }`. Trimmed message must contain 1–2000 characters. Non-object JSON and non-string messages return 400. Any supplied `usuario_id` is ignored; history belongs to the authenticated application user. |
| Chat response | Administrative orientation only: appointments and schedules, not diagnosis or prescriptions. History storage is best-effort; responses do not claim persistence or echo the submitted text. |
| `PUT /api/citas/<id>/cancelar` | Patient account owner or assigned physician. Calls `cambiar_estado_cita` with the server-resolved role/profile, never a client owner ID. |
| `PUT /api/citas/<id>/estado` | Assigned physician only. Supports `pendiente`, `confirmada`, `cancelada`, `rechazada`, `completada`. `reprogramada` requires an accepted change, not this route. |
| `POST /api/citas/<id>/solicitudes-cambio` | Patient owner; `medico_id` selects the destination. Optional `tipo_cita_id` selects a type belonging to that destination. |
| `POST /api/citas/<id>/propuestas-cambio` | Assigned physician; uses that physician's database IANA zone. |
| `PUT /api/citas/propuestas-cambio/<id>/resolver` | Patient owner; `accion` is `aceptar`, `rechazar` or `contraofertar`. Counteroffers use the request's destination physician zone from the database. |
| Change date/time | Send `{ "fecha_local": "2099-06-10", "hora_local": "10:00" }`, plus the operation-specific fields. Local pairs and `fecha_hora` cannot be mixed. Both local fields are required. Caller-supplied `zona_horaria` is never trusted. |
| Legacy change date/time | `fecha_hora` ISO input remains supported and normalized to UTC. Existing offset-free ISO input retains its historical UTC interpretation. |
| `GET /api/citas` | Adds `persona_atendida_id` and current physician `zona_horaria`. Nested `solicitud_cambio` includes `solicitante_rol` and the target physician's `zona_horaria`. Missing enrichment yields a null zone, not an invented UTC offset. |
| `GET /api/citas/solicitudes-cambio` | Preserves the list contract, adding destination `zona_horaria` per request. |
| `GET /api/notificaciones` | Preserves the list response on success. Database failure returns sanitized 503 rather than a false empty inbox. Pagination is future work, not part of this contract change. |

Local DST gaps and repeated wall times are rejected instead of guessed. Future-date validation applies after conversion. No browser timezone or third-party timezone API is used.

## State, reservations and transfer types

- `cancelada`, `rechazada` and `completada` are terminal. They cannot reopen, move, or receive/resolve proposals. Repeating the same terminal status is idempotent and still releases leftover pending rows.
- Every terminal transition releases **all** `pendiente`, `pendiente_paciente` and `pendiente_medico` requests inside the appointment transaction. Changing physician/time/type also invalidates other pending requests. Accepted requests are marked resolved before moving the appointment so cleanup does not overwrite the acceptance.
- Same-physician changes preserve the appointment type unless the patient explicitly selects another valid destination type. Physician proposals and patient counteroffers reserve the selected type's duration, not a fixed 29-minute exclusion interval.
- Cross-physician changes never carry the source physician's type. An explicit target type must belong to the destination; without one, the destination type becomes null and duration is 30 minutes. The source `servicio_id` is cleared on transfer. `persona_atendida_id` is never changed by this migration's transfer routines.
- A type whose duration is null and a legacy appointment with no type both occupy 30 minutes. The legacy `duracion_minutos` request field is range-validated for compatibility but is **not authoritative**: SQL computes the reservation from the target type or the 30-minute fallback.
- Availability includes pending proposals at their actual stored reservation duration, plus preceding-day intervals that overlap the selected day. Booking and reservation triggers remain the authoritative schedule/overlap checks. Typed reservations capture duration when created or counteroffered; accepting revalidates the current appointment type through the booking trigger. Changing a type's configured duration while requests are pending requires operational review.

## Locks and privileges

Supported RPCs acquire the appointment first, physician rows in ascending ID order, and finally the proposal row. Cancellation holds the appointment before its cleanup locks proposals. Resolvers read the proposal FK without locking, then recheck the proposal's appointment, owner, current physician and pending state after obtaining locks. Ascending physician locks avoid the reciprocal-transfer inversion introduced by independently locking source and destination physicians.

This is a designed lock order, not demonstrated live SQL proof. Privileged direct proposal updates, multi-appointment bulk transactions, external routines using other lock orders, and deployment DDL can still create deadlocks; use the supported single-appointment RPCs, avoid concurrent direct writes, and validate two-session contention in staging. No blanket deadlock-free claim is made.

The new HTTP routes call `*_seguro` proposal functions so an installation with only 004/005 cannot accidentally execute the old logic. Missing functions/schema cache produce a sanitized 503 naming migration 011. The migration also replaces the legacy function bodies with guarded wrappers and explicitly revokes `PUBLIC`, `anon`, and `authenticated` execution from old/new mutation RPCs and helpers; only `service_role` is granted execution.

## Migration limits and verification

011 adds a target-type reference to requests. It rejects pending requests attached to terminal appointments or mismatched current owners/physicians, and normalizes remaining pending durations/types. It does not move existing appointments, edit clinical identities, or change migrations 003–010. Existing conflicting/duplicate pending requests are not silently reconciled; review those before deployment. An old same-physician request lacking an original appointment snapshot cannot reveal every historical stale-time case from existing data alone.

Focused offline commands:

```powershell
python -B -m unittest backend.tests.test_audit_workflow
python -B -m unittest backend.tests.test_appointment_workflow
```

The new tests use a fake database and structural SQL assertions. They exercise route identity/validation, local-time conversion, legacy ISO input, safe RPC dispatch/error handling, list enrichment, availability and notification failures. They **do not** execute PostgreSQL functions, verify real grants/RLS, prove atomicity under concurrency, apply migrations, or certify clinical compliance.

The appointment allowlist regression now accepts `completada` and still rejects unsupported states. Completion and cancellation close all pending reservations and remain terminal in the audited workflow.

Clinical routes are registered by the application host. Apply migration 012 after 011 before using the clinical module; see [CLINICAL_RECORDS.md](CLINICAL_RECORDS.md).

Security references: [Supabase database function permissions](https://supabase.com/docs/guides/database/functions) and [PostgreSQL consistent lock ordering](https://www.postgresql.org/docs/17/explicit-locking.html). These describe the hardening approach, not proof of deployed permissions.

Before production, verify in staging: rejection of stale acceptance after cancellation/completion; cleanup of all three pending states; typed 15/60-minute and null-duration overlaps; cross-doctor transfers with valid/invalid/no target type; reciprocal transfer transactions; and denied execution as anonymous/authenticated roles. No such staging proof is claimed here.
