"""Structural SQL checks; these do not claim PostgreSQL execution proof."""
from pathlib import Path
import re
import unittest

MIGRATION = Path(__file__).resolve().parents[1] / 'migrations/013_appointment_notifications.sql'


class AppointmentNotificationMigrationTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MIGRATION.exists(), 'A forward notification migration is required')
        self.sql = MIGRATION.read_text(encoding='utf-8')

    def function(self, name):
        match = re.search(r'CREATE OR REPLACE FUNCTION public\.' + name + r'\(.*?\$\$;', self.sql, re.S)
        self.assertIsNotNone(match, name)
        return match.group()

    def test_every_supported_appointment_action_has_transactional_delivery(self):
        for routine in ('cambiar_estado_cita', 'solicitar_cambio_cita_seguro',
                        'proponer_cambio_cita_seguro', 'resolver_cambio_cita_audit', 'notificar_nueva_cita'):
            with self.subTest(routine=routine):
                self.assertIn('public.notificar_evento_cita(', self.function(routine))
        self.assertIn('BEGIN;', self.sql)
        self.assertTrue(self.sql.rstrip().endswith('COMMIT;'))

    def test_notifications_have_one_insert_owner_and_no_swallowed_failures(self):
        self.assertEqual(self.sql.count('INSERT INTO public.notificaciones'), 1)
        self.assertNotIn('EXCEPTION WHEN OTHERS', self.sql)
        status = self.function('cambiar_estado_cita')
        self.assertIn('p_estado IS DISTINCT FROM estado_anterior', status)
        self.assertIn("current_setting('asistme.propuesta_medico', true)", self.function('solicitar_cambio_cita_seguro'))
        doctor = self.function('proponer_cambio_cita_seguro')
        self.assertIn("set_config('asistme.propuesta_medico', '1', true)", doctor)
        self.assertIn("set_config('asistme.propuesta_medico', contexto_anterior, true)", doctor)

    def test_actor_exclusion_and_transfer_recipient_use_database_relationships(self):
        helper = self.function('notificar_evento_cita')
        for fragment in ('public.pacientes', 'public.medicos', 'solicitud.medico_actual_id',
                         'destinatario <> actor_usuario', "solicitud.estado = 'aceptada'", 'UNION', 'AT TIME ZONE zona'):
            self.assertIn(fragment, helper)
        self.assertNotIn('motivo', helper)
        self.assertNotIn('beneficiario_telefono', helper)

    def test_existing_availability_identity_and_privilege_guards_survive(self):
        for fragment in ('public.validar_espacio_cita(', 'public.bloquear_medicos_cambio(',
                         "'cancelada','rechazada','completada'", 'solicitud.paciente_id IS DISTINCT FROM cita_actual.paciente_id'):
            self.assertIn(fragment, self.sql)
        self.assertNotIn('CREATE OR REPLACE FUNCTION public.crear_cita_validada', self.sql)
        self.assertIn('FROM PUBLIC, anon, authenticated', self.sql)
        self.assertIn('TO service_role', self.sql)
        self.assertNotIn('DELETE FROM public.notificaciones', self.sql)

    def test_resolution_reports_all_responses_without_an_extra_status_message(self):
        resolver = self.function('resolver_cambio_cita_audit')
        self.assertEqual(resolver.count('public.notificar_evento_cita('), 1)
        for action in ('contraofertar', 'aceptar', 'rechazar'):
            self.assertIn(action, resolver)
        self.assertNotIn('CREATE TRIGGER', self.sql)
        self.assertIn("NEW.estado = 'pendiente'", self.function('notificar_nueva_cita'))

if __name__ == '__main__':
    unittest.main()
