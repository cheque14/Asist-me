"""Offline clinical HTTP tests; no app/database import or live SQL execution."""
from copy import deepcopy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from flask import Flask, jsonify


BACKEND = Path(__file__).resolve().parents[1]


class DatabaseError(Exception):
    def __init__(self, code):
        super().__init__("PRIVATE patient details and database connection")
        self.code = code


class Query:
    def __init__(self, db, name):
        self.db, self.name, self.filters = db, name, []
        self.cap = None

    def select(self, columns):
        self.db.queries.append((self.name, columns, self.filters))
        return self

    def eq(self, key, value):
        self.filters.append((key, [value]))
        return self

    def in_(self, key, values):
        self.filters.append((key, values))
        return self

    def limit(self, value):
        self.cap = value
        return self

    def execute(self):
        if self.db.error:
            raise self.db.error
        rows = [deepcopy(row) for row in self.db.rows[self.name]
                if all(row.get(key) in values for key, values in self.filters)]
        return SimpleNamespace(data=rows[:self.cap] if self.cap else rows)


class FakeDatabase:
    """Only a mock of PostgREST; SQL security requires separate deployment proof."""
    def __init__(self):
        self.rows = {
            "personas_atendidas": [
                {"id": 1, "paciente_id": 10, "tipo": "titular", "nombre": "Holder",
                 "telefono": "5551234567", "fecha_nacimiento": None},
                {"id": 2, "paciente_id": 10, "tipo": "beneficiario", "nombre": "Guest",
                 "telefono": "5551234567", "fecha_nacimiento": None},
                {"id": 3, "paciente_id": 11, "tipo": "titular", "nombre": "Other",
                 "telefono": "5559876543", "fecha_nacimiento": None}],
            "citas": [
                {"id": 100, "persona_atendida_id": 1, "paciente_id": 10,
                 "medico_id": 20, "estado": "confirmada", "fecha_hora": "2026-11-01T12:00:00Z"},
                {"id": 101, "persona_atendida_id": 2, "paciente_id": 10,
                 "medico_id": 20, "estado": "completada", "fecha_hora": "2026-10-01T12:00:00Z"}],
        }
        self.queries, self.calls, self.notes = [], [], []
        self.error = None

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, params):
        self.calls.append((name, deepcopy(params)))
        if self.error:
            raise self.error
        if name == "clinical_personas":
            patient = params["p_usuario_id"] == 5
            people = self.rows["personas_atendidas"][:2]
            result = [dict(p, acceso_clinico=not patient or p["tipo"] == "titular")
                      for p in people]
        elif name == "clinical_expediente":
            persona = next(p for p in self.rows["personas_atendidas"]
                           if p["id"] == params["p_persona_id"])
            notes = [n for n in self.notes if n["persona_id"] == persona["id"]]
            offset, limit = params["p_offset"], params["p_limit"]
            result = {"persona": persona, "notas": notes[offset:offset + limit],
                      "citas": [{key: c[key] for key in ("id", "fecha_hora", "estado")}
                                for c in self.rows["citas"]
                                if c["persona_atendida_id"] == persona["id"]
                                and c["paciente_id"] == persona["paciente_id"]
                                and (params["p_usuario_id"] == 5 or c["medico_id"] == 20)
                                and c["estado"] in ("confirmada", "reprogramada", "completada")],
                      "paginacion": {"offset": offset, "limit": limit, "total": len(notes),
                                     "has_more": offset + limit < len(notes)}}
        elif name == "clinical_agregar_nota":
            note = dict(params["p_datos"], id=len(self.notes) + 1,
                        persona_id=params["p_persona_id"], medico_id=20,
                        autor_nombre="Database Physician", creado_en="2026-01-01T12:00:00Z")
            self.notes.append(note)
            result = {"nota": note}
        elif name == "clinical_actualizar_persona":
            persona = next(p for p in self.rows["personas_atendidas"]
                           if p["id"] == params["p_persona_id"])
            persona["fecha_nacimiento"] = params["p_fecha_nacimiento"]
            result = {"persona": persona}
        else:
            raise AssertionError(name)
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=deepcopy(result)))


class ClinicalRecordsTests(unittest.TestCase):
    def setUp(self):
        self.network = patch("socket.socket.connect", side_effect=AssertionError("Network forbidden"))
        self.network.start()
        self.addCleanup(self.network.stop)
        spec = importlib.util.spec_from_file_location("isolated_clinical_records", BACKEND / "clinical_records.py")
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.db = FakeDatabase()
        self.actor = {"id": 5, "perfil_id": 10, "rol": "paciente"}
        self.app = Flask(__name__)
        self.app.config["TESTING"] = True

        def authenticate():
            if self.actor is None:
                return None, (jsonify(error="Sesión requerida"), 401)
            return self.actor, None

        self.module.register_clinical_routes(self.app, lambda: self.db, authenticate)
        self.client = self.app.test_client()

    def doctor(self):
        self.actor = {"id": 6, "perfil_id": 20, "rol": "medico"}

    def post(self, payload=None, person=1):
        return self.client.post(f"/api/expedientes/{person}/notas",
                                json=payload if payload is not None else {"motivo": "Review"})

    def test_authentication_required_for_every_route(self):
        self.actor = None
        for method, path in [("get", "/api/expedientes/personas"), ("get", "/api/expedientes/1"),
                             ("post", "/api/expedientes/1/notas"),
                             ("patch", "/api/expedientes/1/persona")]:
            self.assertEqual(getattr(self.client, method)(path).status_code, 401)
        self.assertFalse(self.db.queries or self.db.calls)

    def test_unsupported_role_and_invalid_authenticated_ids_denied(self):
        for changes in ({"rol": "admin"}, {"id": True}, {"perfil_id": None}):
            self.actor = dict(id=5, perfil_id=10, rol="paciente")
            self.actor.update(changes)
            self.assertEqual(self.client.get("/api/expedientes/personas").status_code, 403)

    def test_patient_metadata_lists_guest_without_clinical_permission(self):
        response = self.client.get("/api/expedientes/personas")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([p["acceso_clinico"] for p in response.json], [True, False])
        self.assertEqual(self.db.calls[-1], ("clinical_personas", {"p_usuario_id": 5}))

    def test_patient_can_read_only_own_holder(self):
        self.assertEqual(self.client.get("/api/expedientes/1").status_code, 200)
        for person in (2, 3):
            self.assertEqual(self.client.get(f"/api/expedientes/{person}").status_code, 403)
        self.assertEqual(len(self.db.calls), 1)

    def test_missing_person_is_not_found(self):
        self.assertEqual(self.client.get("/api/expedientes/99").status_code, 404)

    def test_patient_cannot_write_notes_or_demographics(self):
        self.assertEqual(self.post().status_code, 403)
        self.assertEqual(self.client.patch("/api/expedientes/1/persona",
                                          json={"fecha_nacimiento": "2000-01-01"}).status_code, 403)
        self.assertFalse(self.db.calls or self.db.notes)

    def test_physician_requires_actual_active_relationship(self):
        self.doctor()
        for status in ("pendiente", "cancelada", "rechazada", "unknown", None):
            self.db.rows["citas"][0]["estado"] = status
            self.assertEqual(self.client.get("/api/expedientes/1").status_code, 403)
            self.assertEqual(self.post().status_code, 403)
        self.assertEqual(self.client.get("/api/expedientes/3").status_code, 403)
        self.assertFalse(self.db.calls)

    def test_assigned_physician_reads_holder_and_guest(self):
        self.doctor()
        for person in (1, 2):
            self.assertEqual(self.client.get(f"/api/expedientes/{person}").status_code, 200)
        self.actor["perfil_id"] = 21
        self.assertEqual(self.client.get("/api/expedientes/1").status_code, 403)

    def test_note_author_and_timestamp_are_server_fields(self):
        self.doctor()
        response = self.post()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["nota"]["autor_nombre"], "Database Physician")
        self.assertEqual(response.json["nota"]["medico_id"], 20)
        self.assertEqual(self.db.calls[-1], ("clinical_agregar_nota", {
            "p_usuario_id": 6, "p_persona_id": 1, "p_datos": {"motivo": "Review"}}))

    def test_reject_forged_provenance_and_unknown_fields(self):
        self.doctor()
        for key in ("medico_id", "autor_nombre", "creado_en", "persona_id", "paciente_id", "extra"):
            self.assertEqual(self.post({"motivo": "Review", key: "forged"}).status_code, 400)
        self.assertFalse(self.db.calls or self.db.notes)

    def test_note_text_fields_are_bounded_strings_and_nonempty(self):
        self.doctor()
        for payload in ({}, [], None, {"motivo": " "}, {"diagnostico": 42},
                        {"motivo": "x" * 2001}, {"antecedentes": "x" * 8001},
                        {"alergias": None}, {"motivo": "x\u0000"}):
            response = self.client.post("/api/expedientes/1/notas", json=payload)
            self.assertEqual(response.status_code, 400, payload)
        self.assertFalse(self.db.notes)

    def test_note_accepts_all_snapshot_fields(self):
        self.doctor()
        data = {key: "Recorded" for key in ("antecedentes", "alergias", "motivo", "exploracion",
                                            "diagnostico", "tratamiento", "seguimiento")}
        self.assertEqual(self.post(data).status_code, 201)
        self.assertEqual(self.db.calls[-1][1]["p_datos"], data)

    def test_agreed_vital_keys_accept_bounded_strings(self):
        self.doctor()
        signs = {"peso_kg": "70", "talla_cm": "170", "temperatura_c": "36.5",
                 "frecuencia_cardiaca": "75", "presion_arterial": "120/80",
                 "saturacion_oxigeno": "98"}
        self.assertEqual(self.post({"motivo": "Review", "signos_vitales": signs}).status_code, 201)
        self.assertEqual(self.db.notes[0]["signos_vitales"], signs)

    def test_reject_unknown_vital_units_shapes_and_overflow(self):
        self.doctor()
        for signs in ([], None, {"unknown": "1"}, {"peso_kg": 70}, {"peso_kg": "70 lb"},
                      {"temperatura_c": "98 F"}, {"peso_kg": "-1"},
                      {"peso_kg": "NaN"}, {"peso_kg": "1" * 33},
                      {"presion_arterial": "text"}, {"frecuencia_cardiaca": {"valor": 70}}):
            self.assertEqual(self.post({"motivo": "Review", "signos_vitales": signs}).status_code, 400, signs)
        self.assertFalse(self.db.notes)

    def test_optional_appointment_must_be_positive_and_match_subject_and_doctor(self):
        self.doctor()
        for value in (True, 0, -1, "100", 999, 101):
            self.assertEqual(self.post({"motivo": "Review", "cita_id": value}).status_code, 400)
        self.assertEqual(self.post({"motivo": "Review", "cita_id": 100}).status_code, 201)

    def test_notes_are_append_only_snapshots(self):
        self.doctor()
        self.assertEqual(self.post({"motivo": "First", "diagnostico": "Snapshot A"}).status_code, 201)
        original = deepcopy(self.db.notes[0])
        self.assertEqual(self.post({"motivo": "Follow-up", "diagnostico": "Snapshot B"}).status_code, 201)
        self.assertEqual(self.db.notes[0], original)
        for method in ("put", "delete", "patch"):
            self.assertEqual(getattr(self.client, method)("/api/expedientes/1/notas").status_code, 405)
        self.assertEqual(len(self.db.notes), 2)

    def test_explicit_pagination_never_silently_truncates_notes(self):
        self.doctor()
        for index in range(3):
            self.post({"motivo": str(index)})
        page = self.client.get("/api/expedientes/1?limit=2&offset=0")
        self.assertEqual(page.status_code, 200)
        self.assertEqual([n["id"] for n in page.json["notas"]], [1, 2])
        self.assertEqual(page.json["paginacion"], {"limit": 2, "offset": 0, "total": 3, "has_more": True})
        last = self.client.get("/api/expedientes/1?limit=2&offset=2")
        self.assertEqual([n["id"] for n in last.json["notas"]], [3])
        self.assertFalse(last.json["paginacion"]["has_more"])

    def test_record_preserves_eligible_appointment_contract_from_rpc(self):
        self.doctor()
        response = self.client.get("/api/expedientes/1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["citas"], [{"id": 100, "estado": "confirmada",
                                                  "fecha_hora": "2026-11-01T12:00:00Z"}])
        self.assertEqual(self.db.calls[-1][1]["p_usuario_id"], self.actor["id"])

    def test_invalid_ids_and_pagination_are_rejected(self):
        for value in ("0", "-1", "x", "9223372036854775808"):
            self.assertEqual(self.client.get(f"/api/expedientes/{value}").status_code, 400)
        for query in ("limit=0", "limit=101", "offset=-1", "limit=abc", "offset=1000001",
                      "limit=1&limit=2", "paciente_id=10"):
            self.assertEqual(self.client.get("/api/expedientes/1?" + query).status_code, 400)

    def test_physician_can_edit_only_valid_demographic_dob(self):
        self.doctor()
        for value in ("2000-01-01", None):
            response = self.client.patch("/api/expedientes/1/persona", json={"fecha_nacimiento": value})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["persona"]["fecha_nacimiento"], value)
        for payload in ({}, {"nombre": "Other"}, {"fecha_nacimiento": "2999-01-01"},
                        {"fecha_nacimiento": "2000-02-30"}, {"fecha_nacimiento": "20000101"},
                        {"fecha_nacimiento": "1899-01-01"}, {"fecha_nacimiento": 2000}):
            self.assertEqual(self.client.patch("/api/expedientes/1/persona", json=payload).status_code, 400)
        self.assertEqual(self.client.patch("/api/expedientes/3/persona",
                                          json={"fecha_nacimiento": None}).status_code, 403)

    def test_missing_schema_fails_closed_with_migration_guidance(self):
        for code in ("42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"):
            self.db.error = DatabaseError(code)
            response = self.client.get("/api/expedientes/1")
            self.assertEqual(response.status_code, 503)
            self.assertIn("012", response.json["error"])
            self.assertNotIn("PRIVATE", response.get_data(as_text=True))

    def test_database_failures_never_expose_internals(self):
        for code, status in (("42501", 403), ("P0002", 404), ("23514", 400),
                             ("23503", 409), ("08006", 503)):
            self.db.error = DatabaseError(code)
            response = self.client.get("/api/expedientes/1")
            self.assertEqual(response.status_code, status)
            self.assertNotIn("PRIVATE", response.get_data(as_text=True))

    def test_database_value_errors_are_not_echoed_as_validation_messages(self):
        self.db.error = ValueError("PRIVATE connection and patient data")
        response = self.client.get("/api/expedientes/1")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("PRIVATE", response.get_data(as_text=True))

    def test_request_body_is_bounded(self):
        self.doctor()
        response = self.client.post("/api/expedientes/1/notas", data=" " * 50001,
                                    content_type="application/json")
        self.assertEqual(response.status_code, 413)
        self.assertFalse(self.db.notes)


class MigrationStructureTests(unittest.TestCase):
    def test_record_rpc_includes_scoped_eligible_appointments(self):
        sql = (BACKEND / "migrations/012_clinical_records.sql").read_text(encoding="utf-8")
        record = sql.split("CREATE OR REPLACE FUNCTION public.clinical_expediente(", 1)[1].split("END $$;", 1)[0]
        for fragment in ("'citas'", "'fecha_hora'", "'zona_horaria'", "c.persona_atendida_id = p.id",
                         "c.paciente_id = p.paciente_id", "c.medico_id = doctor_id",
                         "c.estado IN ('confirmada','reprogramada','completada')"):
            self.assertTrue(fragment in record, fragment)

    def test_migration_contains_privacy_and_appendonly_guards(self):
        sql = (BACKEND / "migrations/012_clinical_records.sql").read_text(encoding="utf-8")
        for fragment in ("ENABLE ROW LEVEL SECURITY", "SET search_path = ''",
                         "REVOKE ALL", "anon, authenticated", "service_role",
                         "BEFORE UPDATE OR DELETE ON public.notas_clinicas",
                         "persona_atendida_id", "legacy_cita_id", "FOR UPDATE",
                         "clinical_expediente", "clinical_agregar_nota", "clinical_actualizar_persona"):
            self.assertTrue(fragment in sql, fragment)
        self.assertNotIn("DISABLE TRIGGER", sql)
        self.assertNotIn("DROP TABLE", sql)


if __name__ == "__main__":
    unittest.main()
