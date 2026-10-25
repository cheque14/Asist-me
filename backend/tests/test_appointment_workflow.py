"""Offline checks for appointment workflow validation and reservation policy."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch


BACKEND = Path(__file__).resolve().parents[1]


def load_app_module():
    fake_database = types.ModuleType("database")
    fake_database.supabase = object()
    fake_database.sign_in_with_password = lambda credentials: None
    fake_database.sign_up = lambda credentials: None
    fake_database.request_auth_email_change = lambda token, email: None
    fake_database.AuthEmailChangeError = type("AuthEmailChangeError", (Exception,), {"__init__": lambda self, status_code, message: (setattr(self, "status_code", status_code), Exception.__init__(self, message))[-1]})
    previous = sys.modules.get("database")
    sys.modules["database"] = fake_database
    try:
        spec = importlib.util.spec_from_file_location("appointment_workflow_app", BACKEND / "app.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        if previous is None:
            sys.modules.pop("database", None)
        else:
            sys.modules["database"] = previous


class AppointmentWorkflowValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app_module = load_app_module()

    def test_change_routes_expose_schedule_errors_without_bypassing_rpcs(self):
        future = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        cases = (
            ('POST', '/api/citas/31/solicitudes-cambio', 'paciente', {'medico_id': 7, 'fecha_hora': future}),
            ('POST', '/api/citas/31/propuestas-cambio', 'medico', {'fecha_hora': future}),
            ('PUT', '/api/citas/propuestas-cambio/21/resolver', 'paciente', {'accion': 'contraofertar', 'fecha_hora': future}),
            ('PUT', '/api/citas/solicitudes-cambio/21/resolver', 'medico', {'aceptar': True}),
        )
        for method, path, role, payload in cases:
            for message in ('Día no laboral', 'Horario fuera de atención', 'Horario ocupado o reservado'):
                with self.subTest(path=path, message=message):
                    db = Mock()
                    db.rpc.return_value.execute.side_effect = Exception(str({'message': message, 'details': 'internal details'}))
                    with patch.object(self.app_module, 'autenticar_peticion', return_value=({'id': 1, 'rol': role, 'perfil_id': 7}, None)), patch.object(self.app_module, 'obtener_cita_de_solicitud', return_value=31), patch.object(self.app_module, 'supabase', db):
                        response = self.app_module.app.test_client().open(path, method=method, json=payload)
                    self.assertEqual(response.status_code, 409, response.json)
                    self.assertEqual(response.json, {'error': message})
                    db.rpc.assert_called_once()
                    db.table.assert_not_called()


    def test_booking_uses_atomic_rpc_and_maps_availability_failures(self):
        when = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        for message in ("Día no laboral", "Horario fuera de atención", "Horario ocupado o reservado"):
            with self.subTest(message=message):
                database = Mock()
                database.rpc.return_value.execute.side_effect = Exception(message)
                with patch.object(self.app_module, "autenticar_peticion", return_value=(
                    {"id": 1, "rol": "paciente", "perfil_id": 9}, None
                )), patch.object(self.app_module, "supabase", database):
                    response = self.app_module.app.test_client().post("/api/citas", json={
                        "medico_id": 7, "fecha_hora": when, "motivo": "Consulta",
                    })
                self.assertEqual(response.status_code, 409, response.json)
                self.assertEqual(response.json["error"], message)
                database.rpc.assert_called_once()
                self.assertEqual(database.rpc.call_args.args[0], "crear_cita_validada")
                database.table.assert_not_called()

    def test_booking_without_migration_does_not_fall_back_to_unvalidated_insert(self):
        database = Mock()
        database.rpc.return_value.execute.side_effect = Exception("PGRST202 crear_cita_validada not found")
        with patch.object(self.app_module, "autenticar_peticion", return_value=(
            {"id": 1, "rol": "paciente", "perfil_id": 9}, None
        )), patch.object(self.app_module, "supabase", database):
            response = self.app_module.app.test_client().post("/api/citas", json={
                "medico_id": 7, "motivo": "Consulta",
                "fecha_hora": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            })
        self.assertEqual(response.status_code, 503)
        self.assertIn("010_citas_disponibilidad_notificaciones.sql", response.json["error"])
        database.table.assert_not_called()

    def test_future_datetime_is_normalized_to_utc(self):
        source = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        normalized = self.app_module.normalizar_fecha_hora_cita(source)
        self.assertTrue(normalized.endswith("+00:00"))

    def test_past_datetime_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "deben ser futuras"):
            self.app_module.normalizar_fecha_hora_cita("2020-01-01T10:00:00Z")

    def test_status_allowlist_matches_supported_workflow(self):
        supported = {"pendiente", "confirmada", "cancelada", "reprogramada", "rechazada", "completada"}
        for status in supported:
            self.assertEqual(self.app_module.validar_estado_cita(status.upper()), status)
        with self.assertRaisesRegex(ValueError, "no es válido"):
            self.app_module.validar_estado_cita("estado_inexistente")

    def test_monday_zero_is_a_valid_schedule_day(self):
        result = self.app_module.validar_horarios([{
            "dia_semana": 0, "hora_inicio": "09:00", "hora_fin": "17:00",
        }])
        self.assertEqual(result[0]["dia_semana"], 0)

    def test_phone_is_normalized_and_validated(self):
        self.assertEqual(self.app_module.validar_telefono("+52 (55) 1234-5678"), "+525512345678")
        with self.assertRaisesRegex(ValueError, "8 a 15 dígitos"):
            self.app_module.validar_telefono("123-456")

    def test_stale_database_schedule_constraint_returns_migration_guidance(self):
        rpc = Mock()
        rpc.execute.side_effect = Exception("horarios_medico_dia_semana_check rejected day 0")
        with patch.object(self.app_module, "autenticar_peticion", return_value=(
            {"rol": "medico", "perfil_id": 7}, None
        )), patch.object(self.app_module, "supabase", Mock(rpc=Mock(return_value=rpc))):
            response = self.app_module.app.test_client().put("/api/medico/horarios", json={
                "zona_horaria": "America/Mexico_City", "horarios": [],
            })
        self.assertEqual(response.status_code, 409)
        self.assertIn("007_horarios_dia_semana_range.sql", response.json["error"])

    def test_appointment_saves_selected_service_for_the_selected_doctor(self):
        service_query = Mock()
        service_query.select.return_value = service_query
        service_query.eq.return_value = service_query
        service_query.execute.return_value = types.SimpleNamespace(data=[{"id": 17, "medico_id": 7}])
        appointment_query = Mock()
        appointment_query.insert.return_value = appointment_query
        appointment_query.execute.return_value = types.SimpleNamespace(data=[{"id": 31, "servicio_id": 17}])
        database = Mock()
        database.table.side_effect = lambda table: service_query if table == "servicios_medico" else appointment_query
        database.rpc.return_value = appointment_query
        when = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        with patch.object(self.app_module, "autenticar_peticion", return_value=(
            {"id": 1, "rol": "paciente", "perfil_id": 9}, None
        )), patch.object(self.app_module, "supabase", database):
            response = self.app_module.app.test_client().post("/api/citas", json={
                "medico_id": 7, "servicio_id": 17, "fecha_hora": when, "motivo": "Consulta",
            })
        self.assertEqual(response.status_code, 201, response.json)
        self.assertEqual(database.rpc.call_args.args[1]["p_datos"]["servicio_id"], 17)
        service_query.eq.assert_any_call("medico_id", 7)

    def test_appointment_rejects_a_service_not_offered_by_selected_doctor(self):
        service_query = Mock()
        service_query.select.return_value = service_query
        service_query.eq.return_value = service_query
        service_query.execute.return_value = types.SimpleNamespace(data=[])
        database = Mock()
        database.table.return_value = service_query
        when = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        with patch.object(self.app_module, "autenticar_peticion", return_value=(
            {"id": 1, "rol": "paciente", "perfil_id": 9}, None
        )), patch.object(self.app_module, "supabase", database):
            response = self.app_module.app.test_client().post("/api/citas", json={
                "medico_id": 7, "servicio_id": 99, "fecha_hora": when, "motivo": "Consulta",
            })
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("citas", [call.args[0] for call in database.table.call_args_list])


class AppointmentWorkflowMigrationTests(unittest.TestCase):
    def test_booking_migration_enforces_reservations_and_atomic_notification(self):
        sql = (BACKEND / "migrations" / "010_citas_disponibilidad_notificaciones.sql").read_text(encoding="utf-8")
        for required in (
            "FOR UPDATE", "Día no laboral", "Horario fuera de atención",
            "Horario ocupado o reservado", "'pendiente','pendiente_paciente','pendiente_medico'",
            "c.fecha_hora < fin", "coalesce(t.duracion_minutos, 30)",
            "s.fecha_hora_solicitada < fin", "INSERT INTO public.notificaciones",
            "'nueva_cita'", "AFTER INSERT ON public.citas", "REVOKE ALL",
            "BEFORE INSERT OR UPDATE OF medico_solicitado_id", "COMMIT;",
        ):
            self.assertIn(required, sql)

    def test_pending_request_reserves_and_is_resolved_by_rpc(self):
        migration = (BACKEND / "migrations" / "004_citas_workflow.sql").read_text(encoding="utf-8")
        self.assertIn("CREATE TABLE IF NOT EXISTS public.solicitudes_cambio_cita", migration)
        self.assertIn("CREATE OR REPLACE FUNCTION public.solicitar_cambio_cita", migration)
        self.assertIn("estado = 'pendiente'", migration)
        self.assertIn("CREATE OR REPLACE FUNCTION public.resolver_cambio_cita", migration)
        self.assertIn("estado = 'reprogramada'", migration)

    def test_booking_details_and_physician_proposals_are_migrated(self):
        migration = (BACKEND / "migrations" / "005_cita_participantes_y_propuestas.sql").read_text(encoding="utf-8")
        for column in ("motivo", "es_para_otra_persona", "beneficiario_nombre", "beneficiario_telefono"):
            self.assertIn(f"ADD COLUMN IF NOT EXISTS {column}", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS public.notificaciones", migration)
        self.assertIn("CREATE OR REPLACE FUNCTION public.proponer_cambio_cita", migration)
        self.assertIn("resolver_propuesta_cita_paciente", migration)
        self.assertIn("DROP CONSTRAINT IF EXISTS solicitudes_cambio_cita_solicitante_rol_check", migration)
        self.assertIn("EXCEPTION WHEN OTHERS THEN", migration)
        self.assertIn("propuesta.solicitante_rol <> 'medico'", migration)

    def test_reprogrammed_status_migration_preserves_existing_status_rules(self):
        migration = (BACKEND / "migrations" / "006_citas_estado_reprogramada.sql").read_text(encoding="utf-8")
        self.assertIn("DROP CONSTRAINT IF EXISTS citas_estado_check", migration)
        self.assertIn("ADD CONSTRAINT citas_estado_check", migration)
        for status in ("pendiente", "confirmada", "cancelada", "completada", "reprogramada"):
            self.assertIn(f"'{status}'::character varying", migration)
        self.assertNotIn(" OR estado", migration)

    def test_schedule_migration_matches_python_weekday_range(self):
        migration = (BACKEND / "migrations" / "007_horarios_dia_semana_range.sql").read_text(encoding="utf-8")
        self.assertIn("DROP CONSTRAINT IF EXISTS horarios_medico_dia_semana_check", migration)
        self.assertIn("dia_semana BETWEEN 0 AND 6", migration)

    def test_patient_phone_migration_is_additive(self):
        migration = (BACKEND / "migrations" / "008_usuario_telefono.sql").read_text(encoding="utf-8")
        self.assertIn("ADD COLUMN IF NOT EXISTS telefono text", migration)


if __name__ == "__main__":
    unittest.main()
