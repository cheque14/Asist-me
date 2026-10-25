"""Booking identity and clinical-relationship bootstrap regression tests."""
import unittest
from pathlib import Path
import re
from types import SimpleNamespace
from unittest.mock import Mock, patch
from backend.tests.test_appointment_workflow import load_app_module


class PersonBookingIdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_app_module()

    def request(self, payload, rows=None, role='paciente'):
        db = Mock()
        q = db.table.return_value
        for method in ('select', 'eq', 'in_', 'limit'):
            getattr(q, method).return_value = q
        q.execute.return_value = SimpleNamespace(data=rows or [])
        db.rpc.return_value.execute.return_value = SimpleNamespace(data={'id': 31})
        actor = {'id': 1, 'rol': role, 'perfil_id': 9 if role == 'paciente' else 7}
        body = {'medico_id': 7, 'motivo': 'Consulta', 'fecha_hora': '2099-10-30T21:00:00Z', **payload}
        with patch.object(self.module, 'autenticar_peticion', return_value=(actor, None)), patch.object(self.module, 'supabase', db):
            result = self.module.app.test_client().post('/api/citas', json=body)
        return result, db

    def test_repeat_beneficiary_uses_explicit_owned_identity_and_canonical_name(self):
        result, db = self.request({'persona_atendida_id': 77, 'es_para_otra_persona': True,
                                  'beneficiario_nombre': 'Untrusted', 'beneficiario_telefono': '5555555555'},
                                 [{'id': 77, 'paciente_id': 9, 'tipo': 'beneficiario', 'nombre': 'Persona registrada', 'telefono': '5555555556'}])
        self.assertEqual(result.status_code, 201, result.json)
        data = db.rpc.call_args.args[1]['p_datos']
        self.assertEqual(data['persona_atendida_id'], 77)
        self.assertEqual(data['beneficiario_nombre'], 'Persona registrada')
        self.assertEqual(data['beneficiario_telefono'], '5555555556')

    def test_foreign_subject_and_invalid_ids_cannot_be_booked(self):
        for value in (True, -1, '77', 77):
            with self.subTest(value=value):
                result, db = self.request({'persona_atendida_id': value, 'es_para_otra_persona': True,
                                          'beneficiario_nombre': 'Persona', 'beneficiario_telefono': '5555555555'})
                self.assertIn(result.status_code, (400, 403))
                db.rpc.assert_not_called()

    def test_legacy_beneficiary_without_phone_can_supply_booking_contact(self):
        result, db = self.request({'persona_atendida_id': 77, 'es_para_otra_persona': True,
                                  'beneficiario_nombre': 'Persona', 'beneficiario_telefono': '5555555555'},
                                 [{'id': 77, 'paciente_id': 9, 'tipo': 'beneficiario', 'nombre': 'Persona', 'telefono': ''}])
        self.assertEqual(result.status_code, 201)
        self.assertEqual(db.rpc.call_args.args[1]['p_datos']['beneficiario_telefono'], '5555555555')

    def test_physician_cannot_bootstrap_access_by_booking_an_unknown_patient(self):
        result, db = self.request({'paciente_id': 999}, role='medico')
        self.assertEqual(result.status_code, 403, result.json)
        db.rpc.assert_not_called()

    def test_physician_can_schedule_existing_titular_care_relationship(self):
        result, db = self.request({'paciente_id': 9}, [{'id': 1}], role='medico')
        self.assertEqual(result.status_code, 201, result.json)
        self.assertEqual(db.rpc.call_args.args[1]['p_datos']['paciente_id'], 9)

    def test_new_beneficiary_requires_patient_initiation(self):
        result, db = self.request({'paciente_id': 9, 'es_para_otra_persona': True,
                                  'beneficiario_nombre': 'Persona', 'beneficiario_telefono': '5555555555'}, [{'id': 1}], role='medico')
        self.assertEqual(result.status_code, 403)
        db.rpc.assert_not_called()

    def test_sql_booking_insert_preserves_explicit_attended_person_fk(self):
        sql = (Path(__file__).resolve().parents[1] / 'migrations/012_clinical_records.sql').read_text(encoding='utf-8')
        function = re.search(r'CREATE OR REPLACE FUNCTION public\.crear_cita_validada\(.*?\$\$;', sql, re.S)
        self.assertIsNotNone(function, '012 must replace the explicit booking INSERT from010')
        insert = re.search(r'INSERT INTO public\.citas\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*RETURNING', function.group(), re.S)
        self.assertIsNotNone(insert)
        columns = [column.strip() for column in insert.group(1).split(',')]
        values = [value.strip() for value in insert.group(2).split(',')]
        self.assertEqual(len(columns), len(values))
        projection = dict(zip(columns, values))
        self.assertEqual(projection.get('persona_atendida_id'), 'datos.persona_atendida_id')

if __name__ == '__main__':
    unittest.main()
