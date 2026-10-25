# Editable user profile
Objective: Let patients and doctors edit profile details, with email changes applied only after Supabase confirmation.
Branch: jafet | Delivery: ask-on-risk | Runner: `python -m unittest discover -s backend/tests` and `npm run build` in `frontend`.

## Specs
1. S1 — User request: “En la sección del perfil de cada usuario (paciente o medico). Que pueda editar los datos, por ejemplo agregar el numero de telefono, cambiar el nombre, el correo, etc.” Both roles can edit their profile fields; backend validates ownership and input.
2. S2 — User confirmation: “si, solo despues de confirmarlo.” New email remains pending until the authentication provider confirms it; profile email is synchronized after confirmation. Checks: auth/profile tests and frontend build.

## Tasks
- T1 (S1-S2): inline; implementation and checks complete; user must apply the migration; native review consent pending.

## Log
- L1: “En la sección del perfil de cada usuario (paciente o medico). Que pueda editar los datos, por ejemplo agregar el numero de telefono, cambiar el nombre, el correo, etc.”
- L2: “si, solo despues de confirmarlo.”
- Starting assessment: current profile screen is read-only; authenticated profile lookup is tied to email. Stable local email should not change until Auth confirmation. Engram mirror pending because this runtime has no registered session identity.
- Implemented `PUT /api/auth/profile`, the editable profile form for both roles, a confirmation-requested email update using the authenticated bearer token, and a database trigger that changes the app email only when Supabase Auth changes its email. Added regression checks.
- Verification: `python -m unittest discover -s backend/tests` — 24 tests passed. `npm run build` — compiled successfully. Required migration `backend/migrations/009_perfil_edicion_correo.sql` has not been applied to the live database. Independent high-risk verification is pending.
- Independent review found and drove one correction batch: stop logging auth headers; defer name/phone writes until the email request is accepted; preserve pending email after uncertain provider outcomes. Added a safe confirmation-resend action.
- Corrected verification: backend suite — 28 tests passed; frontend build compiled. Independent bounded recheck passed all three blockers; three focused tests and three isolated stateful probes passed. PostgreSQL migration execution remains unverified; apply migration manually before using the new profile fields. Native review consent is awaiting the user.
