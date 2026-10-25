"""Offline booking regression tests for clinic-local date/time inputs."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from backend.tests.test_appointment_workflow import load_app_module


class ClinicTimezoneBookingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_app_module()

    def test_clinic_time_is_converted_using_iana_rules(self):
        convert = self.module.convertir_horario_consultorio_a_utc
        self.assertEqual(convert('2026-10-30', '15:00', 'America/Mexico_City'), '2026-10-30T21:00:00+00:00')
        self.assertEqual(convert('2026-10-30', '00:15', 'Asia/Tokyo'), '2026-10-29T15:15:00+00:00')

    def test_nonexistent_and_ambiguous_clinic_times_are_not_silently_changed(self):
        convert = self.module.convertir_horario_consultorio_a_utc
        for date, time in [('2026-03-08', '02:30'), ('2026-11-01', '01:30')]:
            with self.subTest(date=date), self.assertRaises(ValueError):
                convert(date, time, 'America/New_York')

    def request(self, payload, zone='America/Mexico_City'):
        database = Mock()
        query = database.table.return_value
        query.select.return_value = query
        query.eq.return_value = query
        query.execute.return_value = SimpleNamespace(data=[{'zona_horaria': zone}])
        database.rpc.return_value.execute.return_value = SimpleNamespace(data={'id': 31})
        with patch.object(self.module, 'autenticar_peticion', return_value=({'id': 1, 'rol': 'paciente', 'perfil_id': 9}, None)), patch.object(self.module, 'supabase', database):
            response = self.module.app.test_client().post('/api/citas', json={'medico_id': 7, 'motivo': 'Consulta', **payload})
        return response, database

    def test_booking_uses_doctor_zone_not_patient_supplied_zone(self):
        response, database = self.request({'fecha_local': '2099-10-30', 'hora_local': '15:00', 'zona_horaria': 'Europe/Madrid'})
        self.assertEqual(response.status_code, 201, response.json)
        self.assertEqual(database.rpc.call_args.args[1]['p_datos']['fecha_hora'], '2099-10-30T21:00:00+00:00')
        database.table.assert_called_once_with('medicos')
        database.table.return_value.eq.assert_called_once_with('id', 7)

    def test_legacy_iso_booking_preserves_its_explicit_offset(self):
        response, database = self.request({'fecha_hora': '2099-10-30T15:00:00-06:00'})
        self.assertEqual(response.status_code, 201, response.json)
        self.assertEqual(database.rpc.call_args.args[1]['p_datos']['fecha_hora'], '2099-10-30T21:00:00+00:00')
        database.table.assert_not_called()

    def test_incomplete_or_mixed_inputs_do_not_create_appointments(self):
        for payload in [
            {'fecha_local': '2099-10-30'},
            {'fecha_local': '2099-10-30', 'hora_local': '15:00', 'fecha_hora': '2099-10-30T21:00:00Z'},
            {'fecha_local': '2099-10-30', 'hora_local': '15:00+02:00'},
        ]:
            with self.subTest(payload=payload):
                response, database = self.request(payload)
                self.assertEqual(response.status_code, 400, response.json)
                database.rpc.assert_not_called()

    def test_invalid_clinic_zone_does_not_fall_back_to_browser_time(self):
        response, database = self.request({'fecha_local': '2099-10-30', 'hora_local': '15:00'}, zone='Invalid/Zone')
        self.assertEqual(response.status_code, 400, response.json)
        database.rpc.assert_not_called()
