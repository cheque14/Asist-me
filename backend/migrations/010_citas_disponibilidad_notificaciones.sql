-- Apply after migrations 003–009. No existing appointments are rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION public.validar_espacio_cita(
  p_medico bigint, p_inicio timestamptz, p_duracion integer, p_cita bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  zona text;
  inicio_local timestamp;
  fin_local timestamp;
  fin timestamptz;
  dia integer;
BEGIN
  -- Every appointment and pending reservation takes the same destination lock.
  -- Schedule replacement also updates this doctor row before changing its blocks.
  SELECT m.zona_horaria INTO zona FROM public.medicos m
    WHERE m.id = p_medico FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Médico no encontrado'; END IF;
  IF p_inicio IS NULL OR p_inicio <= now() THEN
    RAISE EXCEPTION 'La fecha y hora deben ser futuras';
  END IF;
  IF p_duracion IS NULL OR p_duracion NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'Duración de cita no válida';
  END IF;
  fin := p_inicio + make_interval(mins => p_duracion);
  inicio_local := p_inicio AT TIME ZONE zona;
  fin_local := fin AT TIME ZONE zona;
  dia := extract(isodow FROM inicio_local)::integer - 1;
  IF NOT EXISTS (SELECT 1 FROM public.horarios_medico h
    WHERE h.medico_id = p_medico AND h.dia_semana = dia) THEN
    RAISE EXCEPTION 'Día no laboral';
  END IF;
  IF inicio_local::date <> fin_local::date OR NOT EXISTS (
    SELECT 1 FROM public.horarios_medico h
    WHERE h.medico_id = p_medico AND h.dia_semana = dia
      AND p_inicio >= ((inicio_local::date + h.hora_inicio) AT TIME ZONE zona)
      AND fin <= ((inicio_local::date + h.hora_fin) AT TIME ZONE zona)
  ) THEN RAISE EXCEPTION 'Horario fuera de atención'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.citas c
    LEFT JOIN public.tipos_cita_medico t ON t.id = c.tipo_cita_id
    WHERE c.medico_id = p_medico AND c.id IS DISTINCT FROM p_cita
      AND lower(coalesce(c.estado, '')) NOT IN
        ('cancelada','cancelado','canceled','cancelled','anulada','anulado','rechazada','rejected')
      AND c.fecha_hora < fin
      AND c.fecha_hora + make_interval(mins => coalesce(t.duracion_minutos, 30)) > p_inicio
  ) OR EXISTS (
    SELECT 1 FROM public.solicitudes_cambio_cita s
    WHERE s.medico_solicitado_id = p_medico AND s.cita_id IS DISTINCT FROM p_cita
      AND s.estado IN ('pendiente','pendiente_paciente','pendiente_medico')
      AND s.fecha_hora_solicitada < fin
      AND s.fecha_hora_solicitada + make_interval(mins => s.duracion_minutos) > p_inicio
  ) THEN RAISE EXCEPTION 'Horario ocupado o reservado'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_cita_al_guardar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE duracion integer := 30;
BEGIN
  IF lower(coalesce(NEW.estado,'')) IN
    ('cancelada','cancelado','canceled','cancelled','anulada','anulado','rechazada','rejected') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.medico_id = OLD.medico_id AND NEW.fecha_hora = OLD.fecha_hora
      AND NEW.tipo_cita_id IS NOT DISTINCT FROM OLD.tipo_cita_id
      AND lower(coalesce(OLD.estado,'')) NOT IN
        ('cancelada','cancelado','canceled','cancelled','anulada','anulado','rechazada','rejected') THEN
      RETURN NEW; -- Confirmation does not move an already reserved appointment.
    END IF;
  END IF;
  IF NEW.tipo_cita_id IS NOT NULL THEN
    SELECT t.duracion_minutos INTO duracion FROM public.tipos_cita_medico t
      WHERE t.id = NEW.tipo_cita_id AND t.medico_id = NEW.medico_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de cita no válido para el médico'; END IF;
  END IF;
  PERFORM public.validar_espacio_cita(NEW.medico_id, NEW.fecha_hora, duracion, NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_reserva_al_guardar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.estado IN ('pendiente','pendiente_paciente','pendiente_medico') THEN
    PERFORM public.validar_espacio_cita(NEW.medico_solicitado_id,
      NEW.fecha_hora_solicitada, NEW.duracion_minutos, NEW.cita_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificar_nueva_cita()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE destinatario bigint; paciente text; zona text;
BEGIN
  SELECT m.usuario_id, m.zona_horaria INTO destinatario, zona
    FROM public.medicos m WHERE m.id = NEW.medico_id;
  SELECT concat_ws(' ', u.nombres, u.apellidos) INTO paciente
    FROM public.pacientes p JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE p.id = NEW.paciente_id;
  INSERT INTO public.notificaciones(usuario_id, cita_id, tipo, mensaje)
  VALUES (destinatario, NEW.id, 'nueva_cita',
    'Nueva cita: ' || coalesce(nullif(paciente,''), 'Paciente') || ' · ' ||
    to_char(NEW.fecha_hora AT TIME ZONE zona, 'DD/MM/YYYY HH24:MI'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS citas_validar_disponibilidad ON public.citas;
CREATE TRIGGER citas_validar_disponibilidad
  BEFORE INSERT OR UPDATE OF medico_id, fecha_hora, tipo_cita_id, estado ON public.citas
  FOR EACH ROW EXECUTE FUNCTION public.validar_cita_al_guardar();
DROP TRIGGER IF EXISTS reservas_validar_disponibilidad ON public.solicitudes_cambio_cita;
CREATE TRIGGER reservas_validar_disponibilidad
  BEFORE INSERT OR UPDATE OF medico_solicitado_id, fecha_hora_solicitada, duracion_minutos, estado
  ON public.solicitudes_cambio_cita FOR EACH ROW EXECUTE FUNCTION public.validar_reserva_al_guardar();
DROP TRIGGER IF EXISTS citas_notificar_creacion ON public.citas;
CREATE TRIGGER citas_notificar_creacion AFTER INSERT ON public.citas
  FOR EACH ROW EXECUTE FUNCTION public.notificar_nueva_cita();

CREATE OR REPLACE FUNCTION public.crear_cita_validada(p_datos jsonb)
RETURNS public.citas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE resultado public.citas;
BEGIN
  INSERT INTO public.citas(paciente_id, medico_id, fecha_hora, estado, motivo,
    es_para_otra_persona, beneficiario_nombre, beneficiario_telefono, servicio_id, tipo_cita_id)
  VALUES ((p_datos->>'paciente_id')::bigint, (p_datos->>'medico_id')::bigint,
    (p_datos->>'fecha_hora')::timestamptz, p_datos->>'estado', p_datos->>'motivo',
    coalesce((p_datos->>'es_para_otra_persona')::boolean,false),
    p_datos->>'beneficiario_nombre', p_datos->>'beneficiario_telefono',
    (p_datos->>'servicio_id')::bigint, (p_datos->>'tipo_cita_id')::bigint)
  RETURNING * INTO resultado;
  RETURN resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_espacio_cita(bigint,timestamptz,integer,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_cita_al_guardar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_reserva_al_guardar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificar_nueva_cita() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_cita_validada(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cita_validada(jsonb) TO service_role;
COMMIT;
