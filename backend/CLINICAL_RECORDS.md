# Deploy isolated clinical records safely

Appointment history and clinical records are separate navigation entries. A
patient can explicitly select a previously registered beneficiary while booking
to retain that person's clinical identity. The server checks account ownership
and uses the stored name/phone; it never links records by name matching. Historical
beneficiary records remain distinct until an authorized identity reconciliation.
Migration 012 also replaces the explicit booking INSERT from 010 so the selected
`persona_atendida_id` actually reaches the identity trigger; HTTP forwarding alone
does not preserve that association. The replacement remains service-role-only.

Physicians may schedule existing titular care relationships but cannot bootstrap
clinical access by creating a confirmed appointment for an unknown account or a
beneficiary. The patient initiates first appointments; physician approval then
establishes the care relationship used by clinical access checks.

The module implements attended-person records and append-only physician notes. It
does not import `app.py`, `database.py`, environment credentials, or an SDK client.
It does not diagnose, prescribe, implement beneficiary consent, or certify legal or
clinical regulatory compliance.

## Integration contract

The parent application registers the module **after** defining its authentication
function and **before** starting the server:

```python
from clinical_records import register_clinical_routes

register_clinical_routes(app, lambda: supabase, autenticar_peticion)
```

`get_database` is a callable returning the existing server-authorized PostgREST
client. `authenticate` returns `(application_user, error_response)`; the trusted
user supplies `id`, `rol`, and `perfil_id`. Never substitute browser payloads for
this authentication result, or give the server credential to the browser.
Registration in `app.py` is intentionally outside this module's edit surface.

| HTTP operation | Result |
| --- | --- |
| `GET /api/expedientes/personas` | Array of `{id,paciente_id,tipo,nombre,telefono,fecha_nacimiento,acceso_clinico}` |
| `GET /api/expedientes/<id>?limit=50&offset=0` | `{persona,notas,citas,paginacion}` |
| `POST /api/expedientes/<id>/notas` | **201** `{nota}` |
| `PATCH /api/expedientes/<id>/persona` | **200** `{persona}` |

`persona` uses the same public demographic fields as the list. The list accepts
no account filters. IDs are positive signed 64-bit integers. There are no
PUT, PATCH, or DELETE clinical-note routes.

### Record reads and appointment linking

`notas` is chronological, ordered by server `creado_en`, then `id`.
`paginacion` is `{limit,offset,total,has_more}`. Default `limit` is 50; accepted
limits are 1–100 and offsets 0–1,000,000. The UI must follow `has_more` and request
the next offset, or explicitly display that more notes are available. It must
not label the first page as the complete history. Pagination is additive to L5.

`citas` is an additive, unpaginated array of
`{id,fecha_hora,estado,zona_horaria}` for the requested attended person and booking
account. Physicians receive only their own eligible appointments; titular
patients receive their own eligible appointments across physicians. Eligibility
is `confirmada`, `reprogramada`, or `completada`. Dates retain the database's
timestamp representation; use the physician's IANA `zona_horaria` for display.
The UI can use these IDs in its note appointment dropdown. The POST guard still
revalidates the selected appointment: dropdown membership is not authorization.

Each SQL read returns a single JSON value with an explicit nested note page, so
PostgREST's top-level row cap does not silently cut notes, people, or appointments.
There is no automatic relationship expansion from a guessed `paciente_id`.

### Notes and vital signs

POST accepts only the following fields. Omitted text fields become empty strings
in the stored snapshot; prior notes are never edited or automatically copied.
At least one clinical text field must contain non-whitespace text.

| Field | Maximum characters |
| --- | ---: |
| `antecedentes`, `exploracion`, `tratamiento` | 8,000 each |
| `alergias`, `diagnostico`, `seguimiento` | 4,000 each |
| `motivo` | 2,000 |

`cita_id` is optional. If present, it must be a positive JSON integer for this
person, this physician, and an eligible appointment. Strings, booleans, null,
unrelated IDs, pending appointments, and canceled appointments are rejected.

`signos_vitales` is optional, defaults to `{}`, and accepts **only** these optional
string keys, each at most 32 characters:

```json
{
  "peso_kg": "70",
  "talla_cm": "170",
  "temperatura_c": "36.5",
  "frecuencia_cardiaca": "75",
  "presion_arterial": "120/80",
  "saturacion_oxigeno": "98"
}
```

Units are fixed: kg, cm, Celsius, beats/minute, mmHg, and percent respectively.
Do not append unit strings, use Fahrenheit/pounds, send nested measurement objects,
or send numeric JSON values. Empty strings mean unrecorded. Nonempty numeric
values use 1–4 integer digits and up to 3 decimal places and must be positive;
blood pressure uses two positive 1–3 digit integer strings separated by `/`.
These are storage-format bounds, **not** clinical interpretation or diagnostic
thresholds. Unknown fields and null vital objects are rejected.

`persona_id`, `medico_id`, `autor_nombre`, and `creado_en` are never accepted from
the note payload. SQL resolves the authenticated physician and derives the author
name from `usuarios.nombres/apellidos`, with username/`Médico` fallback; it stamps
the timestamp itself. This works even when authentication omits `nombre`.
All request bodies are limited to 48,000 bytes, independent of per-field limits.

### Demographic completion

Physicians with the same eligible treatment relationship may send exactly:

```json
{"fecha_nacimiento": "2000-01-31"}
```

or `{"fecha_nacimiento":null}` to clear the DOB. Only ISO `YYYY-MM-DD` dates
between `1900-01-01` and the current server date are accepted; future dates and
invalid calendar dates are rejected. The response is `{persona}`. The parent UI
service can expose `actualizarPersonaClinicaAPI(token,id,datos)` for this PATCH.
Account, type, name, telephone, and identity changes are not accepted. Patients
cannot mutate DOB, notes, diagnoses, or treatments. DOB is demographic metadata;
changing it does not rewrite any clinical note.

## Privacy and identity boundaries

- A patient may read only their own **titular** clinical record. Booking a
  beneficiary appointment is not consent to read the beneficiary's clinical data.
  Account metadata may list beneficiaries with `acceso_clinico:false`; their DOB
  is redacted to null in that list. No beneficiary consent endpoint is supplied.
- A physician requires an actual eligible appointment for the exact person and
  matching booking account. Pending, canceled, rejected, null, and unknown states
  do not establish a treatment relationship. Checks run in both HTTP and SQL.
- Every patient account gets one stable titular identity. Each uncertain legacy
  beneficiary appointment gets its own identity, even if names/phones match.
  New beneficiary bookings also get distinct identities unless an explicit,
  existing subject with matching account and beneficiary type is supplied.
- Existing appointment identity cannot be reassigned once its old subject has
  clinical notes. Changing the booking account, beneficiary flag, or beneficiary
  details under such notes is also rejected. Physician transfer alone never
  reassigns notes or their authors. Person account/type/ID are always immutable.
- Physician note and DOB writes lock their treatment appointment and person.
  Appointment identity updates lock the old person before checking for notes.
  Database locking/race behavior has **not** been executed by the offline tests.
- Clinical tables enable RLS with no browser policies. PUBLIC, `anon`, and
  `authenticated` receive no clinical table, sequence, or function access.
  `service_role` gets table SELECT and only the four public clinical RPCs; note
  and demographic mutation is guarded inside SECURITY DEFINER functions with
  an empty search path. The privileged migration owner remains an administrator,
  not a security boundary against a database superuser.

The existing booking module may omit explicit `persona_atendida_id`: its INSERT
still receives a stable titular or fresh beneficiary from the trigger. To reuse
an explicitly selected beneficiary later, the parent must forward that field
through its existing booking RPC; do not bypass the trigger or infer identity
from names/phones. No automatic legacy reconciliation is provided.

## Deploy migration 012

No database operation is performed automatically by this module or its tests.
An authorized operator must:

1. Back up and rehearse on a disposable copy of the actual schema. Apply existing
   migrations **001–011**, then `migrations/012_clinical_records.sql` as the schema
   owner. It expects existing `usuarios`, `pacientes`, `medicos`, `citas`, standard
   Supabase roles, beneficiary columns from 005, telephone from 008, and physician
   timezones. A missing or incompatible precondition must abort, not be guessed.
2. Schedule a maintenance window. Migration 012 takes an exclusive appointment
   table lock, creates new storage/functions, backfills only the new identity FK,
   and validates the relationship before making the FK non-null. No old migration
   is edited. No diagnosis or old appointment status/time is rewritten.
3. Run the migration a second time in the disposable copy. Its named constraints,
   indexes, conflict handling, null-only backfill, and replaced functions/triggers
   are designed for idempotent rerun; verify identity and note counts stay stable.
   This is not a schema-repair tool for manually altered partial installations.
4. Confirm anon/authenticated clinical access is denied, the backend's existing
   service role can call the four RPCs, and the role has the expected RLS bypass.
   The migration notifies PostgREST to reload its schema cache. Never expose the
   service credential to front-end code.
5. Register the Flask module and integrate DOB editing, note appointment linking,
   and note pagination in the UI. Run the focused tests below.

Before production use, additionally prove in PostgreSQL: same-name beneficiaries
remain separate; repeated titular bookings reuse one ID; explicit cross-account
and cross-type links fail; subject transfer under notes fails; notes cannot be
updated/deleted; canceled/pending-only physicians cannot read/write; beneficiary
holders cannot read clinical data; and concurrent cancellation/transfer versus
note insertion preserves the identity and authorization guards. Compare all old
appointment columns before/after migration. These live, RLS, trigger, concurrent,
and rerun checks remain **pending**, not implied by the mock tests.

There is no destructive down migration. Preserve clinical data and use a reviewed
forward migration for any deployment correction.

## Focused verification and failure behavior

From the repository root:

```powershell
python -B -m unittest discover -s backend/tests -p test_clinical_records.py -v
```

Tests instantiate fresh Flask apps, inject fake database/authentication callables,
and block socket connections. They exercise HTTP role/subject guards, validation,
RPC actor provenance, append-only endpoint behavior, pagination, appointment
response shape, DOB completion, and sanitized errors. SQL tests are structural
readback only. No real credentials, SDK import, Postgres server, remote requests,
dependency install, shared app modification, or live migration is needed.

Missing clinical tables/columns/functions or a stale schema cache returns **503**
with `012_clinical_records.sql` deployment guidance. Authorization errors return
**403**, missing subjects **404**, invalid input **400**, oversized bodies **413**,
and referential conflicts **409**. Other database failures return sanitized **503**
without SQL text, connection internals, or patient data. Do not blindly retry an
ambiguous POST failure: the write might have committed even if its response was
lost. Exactly-once note submission is not claimed.
