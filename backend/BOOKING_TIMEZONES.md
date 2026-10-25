# Booking in the clinic's timezone

The patient booking form interprets the selected date and time in the doctor's configured IANA timezone, regardless of the patient's location or device timezone.

## Request

`POST /api/citas` accepts these fields alongside the existing booking fields:

```json
{
  "medico_id": 7,
  "fecha_local": "2099-10-30",
  "hora_local": "15:00",
  "motivo": "Consulta"
}
```

The backend reads `medicos.zona_horaria`, converts the clinic-local time to UTC, and calls the existing validated booking RPC. A timezone supplied by the patient is not authoritative. Working hours and pending/occupied slot checks remain enforced by migration010.

- For `America/Mexico_City`, October 30, 2026 at 15:00 converts to 21:00 UTC.
- Both local fields are required together. Do not combine them with `fecha_hora`.
- Invalid timezones and nonexistent/ambiguous daylight-saving times are rejected instead of silently adjusted.
- Existing clients may still send `fecha_hora` as an ISO timestamp; their conversion behavior is unchanged.
- Existing appointments are not rewritten. No new SQL migration is required.

## Configuration and verification

Configure each doctor's actual clinic timezone in the working-hours screen; do not change it to match a traveling patient's location. The form shows that zone and uses its current calendar date for the minimum selectable date.

Offline backend tests: `python -B -m unittest backend.tests.test_clinic_timezone_booking`.

Frontend regression tests: `npm test -- --watchAll=false --runInBand --runTestsByPath src/pages/PacienteMain.test.jsx src/utils/dateTime.test.js` from `frontend`. Run with different `TZ` environment values to verify device-location independence.
