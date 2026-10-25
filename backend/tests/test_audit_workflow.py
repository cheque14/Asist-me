"""Focused offline regressions. SQL assertions are structural, not execution proof."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import types
import unittest
from unittest.mock import Mock, patch

from backend.tests.test_appointment_workflow import load_app_module


BACKEND = Path(__file__).resolve().parents[1]
FUTURE_DATE = "2099-06-10"
ISO_TIME = "2099-06-10T16:00:00+00:00"


class AuditWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_app_module()

    def setUp(self):
        self.db = Mock()
        self.db.rpc.return_value.execute.return_value = types.SimpleNamespace(data={"id": 31})
        self.user = {"id": 5, "rol": "paciente", "perfil_id": 9}
        self.auth_patch = patch.object(self.module, "autenticar_peticion", side_effect=lambda: (self.user, None))
        self.db_patch = patch.object(self.module, "supabase", self.db)
        self.auth_patch.start()
        self.db_patch.start()
        self.addCleanup(self.auth_patch.stop)
        self.addCleanup(self.db_patch.stop)
        self.client = self.module.app.test_client()

    def rows(self, **tables):
        self.queries = {}
        def table(name):
            query = Mock()
            self.queries.setdefault(name, []).append(query)
            for method in ("select", "eq", "in_", "order", "limit", "gte", "lt", "single"):
                getattr(query, method).return_value = query
            query.execute.return_value = types.SimpleNamespace(data=tables.get(name, []))
            return query
        self.db.table.side_effect = table

    def test_chat_requires_existing_bearer_authentication_before_database_access(self):
        self.auth_patch.stop()
        response = self.client.post("/api/chat", json={"mensaje": "hola", "usuario_id": 99})
        self.assertEqual(response.status_code, 401)
        self.db.table.assert_not_called()

    def test_chat_ignores_spoofed_identity_and_has_administrative_copy(self):
        for message in ("hola", "receta", "medicamento", "consulta", "cita"):
            with self.subTest(message=message):
                response = self.client.post("/api/chat", json={"mensaje": message, "usuario_id": 99})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(self.db.table.return_value.insert.call_args.args[0]["usuario_id"], 5)
                text = response.json["respuesta"].lower()
                self.assertNotIn("clínico inteligente", text)
                self.assertNotIn("recetas y notas clínicas se encuentran disponibles", text)
                self.assertNotIn("he registrado", text)

    def test_chat_rejects_invalid_or_oversized_input_without_writing(self):
        for payload in ([], [1], "hello", {}, {"mensaje": 8}, {"mensaje": None},
                        {"mensaje": " "}, {"mensaje": "x" * 2001}):
            with self.subTest(payload=str(payload)[:40]):
                response = self.client.post("/api/chat", json=payload)
                self.assertEqual(response.status_code, 400)
        self.db.table.assert_not_called()

    def test_chat_accepts_trimmed_message_at_limit_without_echo_or_false_storage_claim(self):
        self.db.table.return_value.insert.return_value.execute.side_effect = Exception("private detail")
        response = self.client.post("/api/chat", json={"mensaje": " " + "x" * 2000 + " "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.db.table.return_value.insert.call_args.args[0]["mensaje_usuario"]), 2000)
        self.assertNotIn("private detail", str(response.json))
        self.assertNotIn("he registrado", response.json["respuesta"].lower())

    def test_cancel_and_physician_status_use_only_atomic_rpc_with_server_owner(self):
        for role, path, payload, state in (
            ("paciente", "/api/citas/31/cancelar", {}, "cancelada"),
            ("medico", "/api/citas/31/cancelar", {}, "cancelada"),
            ("medico", "/api/citas/31/estado", {"estado": "completada", "perfil_id": 999}, "completada"),
            ("medico", "/api/citas/31/estado", {"estado": "confirmada"}, "confirmada"),
        ):
            with self.subTest(role=role, path=path, state=state):
                self.db.reset_mock()
                self.user["rol"] = role
                response = self.client.put(path, json=payload)
                self.assertEqual(response.status_code, 200, response.json)
                self.db.rpc.assert_called_once_with("cambiar_estado_cita", {
                    "p_cita_id": 31, "p_rol": role, "p_perfil_id": 9, "p_estado": state,
                })
                self.db.table.assert_not_called()

    def test_status_guards_and_malformed_payload_do_not_mutate(self):
        for role, payload, expected in (
            ("paciente", {"estado": "confirmada"}, 403),
            ("medico", {"estado": "reprogramada"}, 400),
            ("medico", {"estado": "invalid"}, 400),
            ("medico", [1], 400),
        ):
            self.user["rol"] = role
            self.assertEqual(self.client.put("/api/citas/31/estado", json=payload).status_code, expected)
        self.db.rpc.assert_not_called()
        self.db.table.assert_not_called()

    def test_atomic_status_errors_are_sanitized_and_do_not_fall_back(self):
        self.user["rol"] = "medico"
        for message, status in (("PGRST202 cambiar_estado_cita missing SECRET", 503),
                                ("La cita no existe o no te pertenece SECRET", 404),
                                ("Una cita finalizada no puede reabrirse SECRET", 409),
                                ("connection failed SECRET", 500)):
            self.db.rpc.return_value.execute.side_effect = Exception(message)
            response = self.client.put("/api/citas/31/estado", json={"estado": "confirmada"})
            self.assertEqual(response.status_code, status, response.json)
            self.assertNotIn("SECRET", str(response.json))
        self.db.table.assert_not_called()

    def test_change_routes_resolve_wall_time_from_database_target_zone(self):
        self.rows(medicos=[{"id": 8, "zona_horaria": "America/Mexico_City"}],
                  solicitudes_cambio_cita=[{"cita_id": 31, "medico_solicitado_id": 8}],
                  citas=[{"id": 31, "medico_id": 8}])
        cases = (
            ("paciente", "POST", "/api/citas/31/solicitudes-cambio", {"medico_id": 8},
             "solicitar_cambio_cita_seguro", "p_fecha_hora_solicitada"),
            ("medico", "POST", "/api/citas/31/propuestas-cambio", {},
             "proponer_cambio_cita_seguro", "p_fecha_hora_solicitada"),
            ("paciente", "PUT", "/api/citas/propuestas-cambio/21/resolver", {"accion": "contraofertar"},
             "resolver_propuesta_cita_paciente_seguro", "p_fecha_hora_contraoferta"),
        )
        for role, method, path, extra, rpc, field in cases:
            self.db.reset_mock()
            self.user["rol"] = role
            response = self.client.open(path, method=method, json={
                **extra, "fecha_local": FUTURE_DATE, "hora_local": "10:00", "zona_horaria": "UTC",
            })
            self.assertIn(response.status_code, (200, 201), response.json)
            self.assertEqual(self.db.rpc.call_args.args[0], rpc)
            self.assertEqual(self.db.rpc.call_args.args[1][field], ISO_TIME)
            self.queries["medicos"][-1].eq.assert_any_call("id", 9 if role == "medico" else 8)
            if "propuestas-cambio/21/resolver" in path:
                self.queries["solicitudes_cambio_cita"][0].eq.assert_any_call("paciente_id", 9)

    def test_change_routes_preserve_legacy_iso_without_timezone_queries(self):
        cases = (
            ("paciente", "POST", "/api/citas/31/solicitudes-cambio", {"medico_id": 8}),
            ("medico", "POST", "/api/citas/31/propuestas-cambio", {}),
            ("paciente", "PUT", "/api/citas/propuestas-cambio/21/resolver", {"accion": "contraofertar"}),
        )
        with patch.object(self.module, "obtener_cita_de_solicitud", return_value=31), patch.object(
            self.module, "marcar_notificaciones_de_cita_leidas", return_value=True
        ):
            for role, method, path, extra in cases:
                self.db.reset_mock()
                self.user["rol"] = role
                response = self.client.open(path, method=method, json={**extra, "fecha_hora": ISO_TIME})
                self.assertIn(response.status_code, (200, 201), response.json)
                self.db.table.assert_not_called()

    def test_invalid_local_pair_and_mixed_iso_are_rejected(self):
        for extra in ({"fecha_local": FUTURE_DATE}, {"hora_local": "10:00"},
                      {"fecha_local": FUTURE_DATE, "hora_local": "10:00", "fecha_hora": ISO_TIME}):
            response = self.client.post("/api/citas/31/solicitudes-cambio", json={"medico_id": 8, **extra})
            self.assertEqual(response.status_code, 400)
        self.db.rpc.assert_not_called()

    def test_patient_transfer_forwards_optional_destination_type_not_duration_authority(self):
        response = self.client.post("/api/citas/31/solicitudes-cambio", json={
            "medico_id": 8, "fecha_hora": ISO_TIME, "tipo_cita_id": 42, "duracion_minutos": 15,
        })
        self.assertEqual(response.status_code, 201, response.json)
        self.assertEqual(self.db.rpc.call_args.args[1]["p_tipo_cita_id"], 42)
        self.assertEqual(self.db.rpc.call_args.args[1]["p_paciente_id"], 9)

    def test_login_never_prints_identity_or_upstream_exception(self):
        from contextlib import redirect_stdout
        from io import StringIO
        identity = "sensitive@example.test"
        self.rows(usuarios=[{"id": 5, "email": identity, "password_hash": None}])
        output = StringIO()
        with redirect_stdout(output), patch.object(self.module, "sign_in_with_password", side_effect=Exception(identity)):
            response = self.client.post("/api/auth/login", json={"email": identity, "password": "test-password"})
        self.assertEqual(response.status_code, 401)
        self.assertNotIn(identity, output.getvalue())
        self.assertNotIn("test-password", output.getvalue())

    def test_dst_gaps_and_repeated_times_are_rejected_for_changes(self):
        self.rows(medicos=[{"id": 8, "zona_horaria": "America/New_York"}])
        for day, hour in (("2099-03-08", "02:30"), ("2099-11-01", "01:30")):
            response = self.client.post("/api/citas/31/solicitudes-cambio", json={
                "medico_id": 8, "fecha_local": day, "hora_local": hour,
            })
            self.assertEqual(response.status_code, 400, response.json)
        self.db.rpc.assert_not_called()

    def test_missing_safe_workflow_rpcs_return_migration_503(self):
        self.db.rpc.return_value.execute.side_effect = Exception("PGRST202 private database detail")
        with patch.object(self.module, "obtener_cita_de_solicitud", return_value=31):
            for role, method, path, extra in (
                ("paciente", "POST", "/api/citas/31/solicitudes-cambio", {"medico_id": 8}),
                ("medico", "POST", "/api/citas/31/propuestas-cambio", {}),
                ("paciente", "PUT", "/api/citas/propuestas-cambio/21/resolver", {"accion": "aceptar"}),
                ("medico", "PUT", "/api/citas/solicitudes-cambio/21/resolver", {"aceptar": True}),
            ):
                self.user["rol"] = role
                response = self.client.open(path, method=method, json={**extra, "fecha_hora": ISO_TIME})
                self.assertEqual(response.status_code, 503, response.json)
                self.assertIn("011_audit_workflow_fixes.sql", response.json["error"])
                self.assertNotIn("private", str(response.json))

    def test_appointments_include_subject_current_and_target_zone_and_proposer(self):
        self.rows(citas=[{"id": 31, "medico_id": 8, "paciente_id": 9,
                          "fecha_hora": ISO_TIME, "persona_atendida_id": 44}],
                  solicitudes_cambio_cita=[{"id": 21, "cita_id": 31, "medico_solicitado_id": 10,
                                           "solicitante_rol": "medico", "estado": "pendiente_paciente"}],
                  medicos=[{"id": 8, "usuario_id": 18, "zona_horaria": "America/Mexico_City"},
                           {"id": 10, "usuario_id": 20, "zona_horaria": "Europe/Madrid"}])
        response = self.client.get("/api/citas")
        self.assertEqual(response.status_code, 200, response.json)
        row = response.json[0]
        self.assertEqual(row["persona_atendida_id"], 44)
        self.assertEqual(row["zona_horaria"], "America/Mexico_City")
        self.assertEqual(row["solicitud_cambio"]["zona_horaria"], "Europe/Madrid")
        self.assertEqual(row["solicitud_cambio"]["solicitante_rol"], "medico")

    def test_requests_listing_contains_target_doctor_zone(self):
        self.user["rol"] = "medico"
        self.rows(solicitudes_cambio_cita=[{"id": 21, "medico_solicitado_id": 10}],
                  medicos=[{"id": 10, "zona_horaria": "Europe/Madrid"}])
        response = self.client.get("/api/citas/solicitudes-cambio")
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json[0]["zona_horaria"], "Europe/Madrid")

    def test_availability_includes_legacy_no_type_and_true_pending_duration(self):
        day = datetime.now(timezone.utc).date() + timedelta(days=30)
        start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=9)
        self.rows(medicos={"zona_horaria": "UTC"}, tipos_cita_medico={"id": 1, "duracion_minutos": 15},
                  horarios_medico=[{"hora_inicio": "09:00", "hora_fin": "11:00"}],
                  citas=[{"fecha_hora": start.isoformat(), "tipo_cita_id": None, "estado": "confirmada"}],
                  solicitudes_cambio_cita=[{"fecha_hora_solicitada": (start + timedelta(minutes=45)).isoformat(),
                                           "duracion_minutos": 60, "estado": "pendiente_medico"}])
        response = self.client.get(f"/api/medicos/8/disponibilidad?fecha={day}&tipo_cita_id=1")
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual([slot["inicio"][11:16] for slot in response.json["disponibles"]], ["09:30", "10:45"])

    def test_notifications_failure_is_not_false_empty_success(self):
        self.db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.side_effect = Exception("SECRET")
        response = self.client.get("/api/notificaciones")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("SECRET", str(response.json))

    def test_notifications_still_return_list_when_successful(self):
        self.rows(notificaciones=[{"id": 1, "leida": False}])
        response = self.client.get("/api/notificaciones")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, [{"id": 1, "leida": False}])


class AuditMigrationTests(unittest.TestCase):
    def sql(self):
        return (BACKEND / "migrations/011_audit_workflow_fixes.sql").read_text(encoding="utf-8")

    def test_atomic_terminal_cleanup_and_lock_order_are_declared(self):
        sql = self.sql()
        for fragment in ("FUNCTION public.cambiar_estado_cita(", "FOR UPDATE", "ORDER BY m.id",
                         "'pendiente','pendiente_paciente','pendiente_medico'", "'completada'",
                         "Una cita finalizada no puede reabrirse", "solicitud.medico_actual_id",
                         "solicitud.paciente_id", "resuelto_en = now()"):
            self.assertIn(fragment, sql)
        self.assertNotIn("29 minutes", sql)
        self.assertNotIn("persona_atendida_id =", sql)

    def test_typed_transfer_duration_and_legacy_30_are_declared(self):
        sql = self.sql()
        for fragment in ("tipo_cita_solicitado_id", "coalesce(t.duracion_minutos, 30)",
                         "Tipo de cita no válido para el médico", "p_tipo_cita_id",
                         "public.validar_espacio_cita(", "SET medico_id = solicitud.medico_solicitado_id"):
            self.assertIn(fragment, sql)

    def test_all_old_and_safe_mutation_functions_are_service_only(self):
        sql = self.sql()
        for name in ("solicitar_cambio_cita", "proponer_cambio_cita", "resolver_cambio_cita",
                     "resolver_propuesta_cita_paciente", "solicitar_cambio_cita_seguro",
                     "proponer_cambio_cita_seguro", "resolver_cambio_cita_seguro",
                     "resolver_propuesta_cita_paciente_seguro", "cambiar_estado_cita"):
            self.assertIn(f"REVOKE ALL ON FUNCTION public.{name}(", sql)
            self.assertIn(f"GRANT EXECUTE ON FUNCTION public.{name}(", sql)
        self.assertIn("FROM PUBLIC, anon, authenticated", sql)
        self.assertIn("TO service_role", sql)
        self.assertTrue(sql.rstrip().endswith("COMMIT;"))

    def test_development_entrypoint_disables_debug_and_login_does_not_log_identity(self):
        source = (BACKEND / "app.py").read_text(encoding="utf-8")
        self.assertIn("app.run(debug=False", source)
        self.assertNotIn('print(f"[LOGIN] Identificador:', source)
        self.assertNotIn('print(f"[LOGIN] Usuario {email}', source)


if __name__ == "__main__":
    unittest.main()
