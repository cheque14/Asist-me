-- Apply after 010, in a maintenance window. See backend/AUDIT_WORKFLOW.md.
-- This migration is preparation, not evidence of live database execution.
BEGIN;

ALTER TABLE public.solicitudes_cambio_cita
  ADD COLUMN IF NOT EXISTS tipo_cita_solicitado_id bigint
  REFERENCES public.tipos_cita_medico(id);

-- Old reservations used caller-supplied/constant durations. Normalize pending rows
-- without moving any appointment or changing its attended-person identity.
DROP TRIGGER IF EXISTS reservas_validar_disponibilidad ON public.solicitudes_cambio_cita;
UPDATE public.solicitudes_cambio_cita s
SET estado = 'rechazada', resuelto_en = now(), respuesta = 'cita_finalizada_o_modificada'
FROM public.citas c
WHERE c.id = s.cita_id AND s.estado IN ('pendiente','pendiente_paciente','pendiente_medico')
  AND (lower(coalesce(c.estado,'')) IN ('cancelada','rechazada','completada')
       OR s.medico_actual_id IS DISTINCT FROM c.medico_id
       OR s.paciente_id IS DISTINCT FROM c.paciente_id);
UPDATE public.solicitudes_cambio_cita s
SET tipo_cita_solicitado_id = CASE WHEN s.medico_solicitado_id = c.medico_id THEN t.id ELSE NULL END,
    duracion_minutos = CASE WHEN s.medico_solicitado_id = c.medico_id
                           THEN coalesce(t.duracion_minutos, 30) ELSE 30 END
FROM public.citas c LEFT JOIN public.tipos_cita_medico t
  ON t.id = c.tipo_cita_id AND t.medico_id = c.medico_id
WHERE c.id = s.cita_id AND s.estado IN ('pendiente','pendiente_paciente','pendiente_medico')
  AND s.tipo_cita_solicitado_id IS NULL;

CREATE OR REPLACE FUNCTION public.bloquear_medicos_cambio(p_actual bigint, p_destino bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Always acquire both doctor rows in ascending ID order before validation.
  PERFORM m.id FROM public.medicos m
  WHERE m.id IN (p_actual, p_destino) ORDER BY m.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.medicos WHERE id = p_destino) THEN
    RAISE EXCEPTION 'Médico no encontrado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_cita_al_guardar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE duracion integer := 30;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF lower(coalesce(OLD.estado,'')) IN ('cancelada','rechazada','completada')
      AND (NEW.estado IS DISTINCT FROM OLD.estado OR NEW.medico_id IS DISTINCT FROM OLD.medico_id
           OR NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora
           OR NEW.tipo_cita_id IS DISTINCT FROM OLD.tipo_cita_id) THEN
      RAISE EXCEPTION 'Una cita finalizada no puede reabrirse';
    END IF;
  END IF;
  IF lower(coalesce(NEW.estado,'')) IN ('cancelada','rechazada','completada') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.medico_id = OLD.medico_id AND NEW.fecha_hora = OLD.fecha_hora
       AND NEW.tipo_cita_id IS NOT DISTINCT FROM OLD.tipo_cita_id THEN RETURN NEW; END IF;
    PERFORM public.bloquear_medicos_cambio(OLD.medico_id, NEW.medico_id);
  END IF;
  IF NEW.tipo_cita_id IS NOT NULL THEN
    SELECT coalesce(t.duracion_minutos, 30) INTO duracion FROM public.tipos_cita_medico t
      WHERE t.id = NEW.tipo_cita_id AND t.medico_id = NEW.medico_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de cita no válido para el médico'; END IF;
  END IF;
  PERFORM public.validar_espacio_cita(NEW.medico_id, NEW.fecha_hora, duracion, NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cerrar_reservas_cita()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF lower(coalesce(NEW.estado,'')) IN ('cancelada','rechazada','completada')
    OR NEW.medico_id IS DISTINCT FROM OLD.medico_id
    OR NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora
    OR NEW.tipo_cita_id IS DISTINCT FROM OLD.tipo_cita_id THEN
    UPDATE public.solicitudes_cambio_cita
    SET estado = 'rechazada', resuelto_en = now(), respuesta = 'cita_finalizada_o_modificada'
    WHERE cita_id = NEW.id AND estado IN ('pendiente','pendiente_paciente','pendiente_medico');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS citas_cerrar_reservas ON public.citas;
CREATE TRIGGER citas_cerrar_reservas
AFTER UPDATE OF estado, medico_id, fecha_hora, tipo_cita_id ON public.citas
FOR EACH ROW EXECUTE FUNCTION public.cerrar_reservas_cita();

CREATE OR REPLACE FUNCTION public.validar_reserva_al_guardar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cita_actual public.citas;
BEGIN
  IF NEW.estado NOT IN ('pendiente','pendiente_paciente','pendiente_medico') THEN RETURN NEW; END IF;
  SELECT * INTO cita_actual FROM public.citas WHERE id = NEW.cita_id FOR UPDATE;
  IF NOT FOUND OR cita_actual.medico_id IS DISTINCT FROM NEW.medico_actual_id
     OR cita_actual.paciente_id IS DISTINCT FROM NEW.paciente_id THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta o no pertenece a la cita actual';
  END IF;
  IF lower(coalesce(cita_actual.estado,'')) IN ('cancelada','rechazada','completada') THEN
    RAISE EXCEPTION 'No se puede modificar una cita finalizada';
  END IF;
  PERFORM public.bloquear_medicos_cambio(cita_actual.medico_id, NEW.medico_solicitado_id);
  IF EXISTS (SELECT 1 FROM public.solicitudes_cambio_cita s WHERE s.cita_id = NEW.cita_id
             AND s.id IS DISTINCT FROM NEW.id
             AND s.estado IN ('pendiente','pendiente_paciente','pendiente_medico')) THEN
    RAISE EXCEPTION 'La cita ya tiene una propuesta pendiente';
  END IF;
  IF NEW.tipo_cita_solicitado_id IS NULL THEN
    NEW.duracion_minutos := 30;
  ELSE
    SELECT coalesce(t.duracion_minutos, 30) INTO NEW.duracion_minutos
    FROM public.tipos_cita_medico t
    WHERE t.id = NEW.tipo_cita_solicitado_id AND t.medico_id = NEW.medico_solicitado_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de cita no válido para el médico'; END IF;
  END IF;
  PERFORM public.validar_espacio_cita(NEW.medico_solicitado_id,
    NEW.fecha_hora_solicitada, NEW.duracion_minutos, NEW.cita_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER reservas_validar_disponibilidad
BEFORE INSERT OR UPDATE OF cita_id, paciente_id, medico_actual_id, medico_solicitado_id,
  fecha_hora_solicitada, tipo_cita_solicitado_id, duracion_minutos, estado
ON public.solicitudes_cambio_cita FOR EACH ROW EXECUTE FUNCTION public.validar_reserva_al_guardar();

CREATE OR REPLACE FUNCTION public.cambiar_estado_cita(
  p_cita_id bigint, p_rol text, p_perfil_id bigint, p_estado text
) RETURNS public.citas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cita_actual public.citas;
BEGIN
  IF p_rol IS NULL OR p_perfil_id IS NULL OR p_estado IS NULL
     OR p_rol NOT IN ('paciente','medico')
     OR p_estado NOT IN ('pendiente','confirmada','cancelada','rechazada','completada')
     OR (p_rol = 'paciente' AND p_estado <> 'cancelada') THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el estado';
  END IF;
  SELECT * INTO cita_actual FROM public.citas WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND OR (p_rol = 'paciente' AND cita_actual.paciente_id IS DISTINCT FROM p_perfil_id)
     OR (p_rol = 'medico' AND cita_actual.medico_id IS DISTINCT FROM p_perfil_id) THEN
    RAISE EXCEPTION 'La cita no existe o no te pertenece';
  END IF;
  IF lower(coalesce(cita_actual.estado,'')) IN ('cancelada','rechazada','completada')
     AND p_estado IS DISTINCT FROM cita_actual.estado THEN
    RAISE EXCEPTION 'Una cita finalizada no puede reabrirse';
  END IF;
  -- The AFTER trigger releases ALL pending states in this same transaction.
  UPDATE public.citas SET estado = p_estado WHERE id = p_cita_id RETURNING * INTO cita_actual;
  RETURN cita_actual;
END;
$$;

CREATE OR REPLACE FUNCTION public.solicitar_cambio_cita_seguro(
  p_cita_id bigint, p_paciente_id bigint, p_medico_solicitado_id bigint,
  p_fecha_hora_solicitada timestamptz, p_duracion_minutos integer DEFAULT 30,
  p_motivo text DEFAULT NULL, p_tipo_cita_id bigint DEFAULT NULL
) RETURNS public.solicitudes_cambio_cita LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cita_actual public.citas; solicitud public.solicitudes_cambio_cita; tipo bigint;
BEGIN
  SELECT * INTO cita_actual FROM public.citas WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND OR cita_actual.paciente_id IS DISTINCT FROM p_paciente_id OR p_paciente_id IS NULL THEN
    RAISE EXCEPTION 'La cita no existe o no te pertenece';
  END IF;
  IF lower(coalesce(cita_actual.estado,'')) IN ('cancelada','rechazada','completada') THEN
    RAISE EXCEPTION 'No se puede modificar una cita finalizada';
  END IF;
  IF p_duracion_minutos IS NULL OR p_duracion_minutos NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'Duración de cita no válida';
  END IF;
  PERFORM public.bloquear_medicos_cambio(cita_actual.medico_id, p_medico_solicitado_id);
  -- A source doctor's type never travels to another doctor. Explicit destination
  -- types are validated by the trigger; legacy cross-doctor requests reserve 30m.
  tipo := p_tipo_cita_id;
  IF tipo IS NULL AND p_medico_solicitado_id = cita_actual.medico_id THEN tipo := cita_actual.tipo_cita_id; END IF;
  INSERT INTO public.solicitudes_cambio_cita(cita_id, paciente_id, medico_actual_id,
    medico_solicitado_id, fecha_hora_solicitada, tipo_cita_solicitado_id, duracion_minutos,
    estado, solicitante_rol, motivo)
  VALUES (p_cita_id, p_paciente_id, cita_actual.medico_id, p_medico_solicitado_id,
    p_fecha_hora_solicitada, tipo, 30, 'pendiente', 'paciente', nullif(trim(p_motivo),''))
  RETURNING * INTO solicitud;
  RETURN solicitud;
END;
$$;

CREATE OR REPLACE FUNCTION public.proponer_cambio_cita_seguro(
  p_cita_id bigint, p_medico_id bigint, p_fecha_hora_solicitada timestamptz, p_motivo text DEFAULT NULL
) RETURNS public.solicitudes_cambio_cita LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cita_actual public.citas; solicitud public.solicitudes_cambio_cita;
BEGIN
  SELECT * INTO cita_actual FROM public.citas WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND OR cita_actual.medico_id IS DISTINCT FROM p_medico_id OR p_medico_id IS NULL THEN
    RAISE EXCEPTION 'La cita no existe o no te pertenece';
  END IF;
  solicitud := public.solicitar_cambio_cita_seguro(p_cita_id, cita_actual.paciente_id,
    p_medico_id, p_fecha_hora_solicitada, 30, p_motivo, cita_actual.tipo_cita_id);
  UPDATE public.solicitudes_cambio_cita SET solicitante_rol = 'medico', estado = 'pendiente_paciente'
  WHERE id = solicitud.id RETURNING * INTO solicitud;
  INSERT INTO public.notificaciones(usuario_id, cita_id, tipo, mensaje)
  SELECT p.usuario_id, p_cita_id, 'propuesta_cita',
    'Tu médico propuso cambiar la fecha u hora de tu cita. Revisa la propuesta.'
  FROM public.pacientes p WHERE p.id = cita_actual.paciente_id;
  RETURN solicitud;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_cambio_cita_audit(
  p_solicitud_id bigint, p_rol text, p_perfil_id bigint, p_accion text,
  p_fecha_hora timestamptz DEFAULT NULL, p_usuario_id bigint DEFAULT NULL
) RETURNS public.solicitudes_cambio_cita LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cita_id_actual bigint; cita_actual public.citas; solicitud public.solicitudes_cambio_cita;
BEGIN
  -- Read just the immutable FK first, without locking the proposal. Every RPC
  -- locks appointment -> sorted doctors -> proposal, including cancellation.
  SELECT cita_id INTO cita_id_actual FROM public.solicitudes_cambio_cita WHERE id = p_solicitud_id;
  SELECT * INTO cita_actual FROM public.citas WHERE id = cita_id_actual FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La propuesta no existe o ya fue resuelta'; END IF;
  SELECT * INTO solicitud FROM public.solicitudes_cambio_cita WHERE id = p_solicitud_id;
  PERFORM public.bloquear_medicos_cambio(cita_actual.medico_id, solicitud.medico_solicitado_id);
  SELECT * INTO solicitud FROM public.solicitudes_cambio_cita WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND OR solicitud.cita_id IS DISTINCT FROM cita_actual.id
     OR solicitud.medico_actual_id IS DISTINCT FROM cita_actual.medico_id
     OR solicitud.paciente_id IS DISTINCT FROM cita_actual.paciente_id
     OR solicitud.estado NOT IN ('pendiente','pendiente_paciente','pendiente_medico') THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta o no pertenece a la cita actual';
  END IF;
  IF lower(coalesce(cita_actual.estado,'')) IN ('cancelada','rechazada','completada') THEN
    RAISE EXCEPTION 'No se puede modificar una cita finalizada';
  END IF;
  IF p_perfil_id IS NULL OR p_rol IS NULL OR p_rol NOT IN ('paciente','medico') THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el estado';
  ELSIF p_rol = 'paciente' THEN
    IF solicitud.paciente_id IS DISTINCT FROM p_perfil_id OR solicitud.solicitante_rol <> 'medico'
       OR solicitud.estado NOT IN ('pendiente','pendiente_paciente') THEN
      RAISE EXCEPTION 'La propuesta no existe o ya fue resuelta';
    END IF;
  ELSE
    IF solicitud.medico_actual_id IS DISTINCT FROM p_perfil_id
       OR solicitud.estado NOT IN ('pendiente','pendiente_medico') THEN
      RAISE EXCEPTION 'La propuesta no existe o ya fue resuelta';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.medicos m WHERE m.id = p_perfil_id AND m.usuario_id = p_usuario_id) THEN
      RAISE EXCEPTION 'No tienes permiso para cambiar el estado';
    END IF;
  END IF;
  IF p_accion = 'contraofertar' AND p_rol = 'paciente' THEN
    UPDATE public.solicitudes_cambio_cita
    SET fecha_hora_solicitada = p_fecha_hora, estado = 'pendiente_medico',
        respuesta = 'contraoferta', resuelto_en = NULL, resuelto_por = NULL
    WHERE id = p_solicitud_id RETURNING * INTO solicitud;
  ELSIF p_accion IN ('aceptar','rechazar') THEN
    IF p_accion = 'aceptar' THEN
      PERFORM public.validar_espacio_cita(solicitud.medico_solicitado_id,
        solicitud.fecha_hora_solicitada, solicitud.duracion_minutos, solicitud.cita_id);
    END IF;
    -- Resolve the accepted proposal before moving the appointment, so cleanup
    -- rejects other pending rows, not the accepted row itself.
    UPDATE public.solicitudes_cambio_cita
    SET estado = CASE WHEN p_accion = 'aceptar' THEN 'aceptada' ELSE 'rechazada' END,
        respuesta = p_accion, resuelto_en = now(), resuelto_por = p_usuario_id
    WHERE id = p_solicitud_id RETURNING * INTO solicitud;
    IF p_accion = 'aceptar' THEN
      UPDATE public.citas SET medico_id = solicitud.medico_solicitado_id,
        fecha_hora = solicitud.fecha_hora_solicitada, tipo_cita_id = solicitud.tipo_cita_solicitado_id,
        servicio_id = CASE WHEN medico_id = solicitud.medico_solicitado_id THEN servicio_id ELSE NULL END,
        estado = 'reprogramada'
      WHERE id = solicitud.cita_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'La acción no es válida';
  END IF;
  INSERT INTO public.notificaciones(usuario_id, cita_id, tipo, mensaje)
  SELECT CASE WHEN p_rol = 'paciente' THEN m.usuario_id ELSE p.usuario_id END,
    solicitud.cita_id, CASE WHEN p_accion = 'contraofertar' THEN 'contraoferta_cita' ELSE 'respuesta_cita' END,
    CASE WHEN p_accion = 'contraofertar' THEN 'El paciente propuso otro horario para la cita. Revisa y decide.'
         WHEN p_accion = 'aceptar' THEN 'Se aceptó el cambio de cita.' ELSE 'Se rechazó el cambio de cita.' END
  FROM public.pacientes p, public.medicos m
  WHERE p.id = solicitud.paciente_id AND m.id = solicitud.medico_actual_id;
  RETURN solicitud;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_propuesta_cita_paciente_seguro(
  p_solicitud_id bigint, p_paciente_id bigint, p_accion text, p_fecha_hora_contraoferta timestamptz DEFAULT NULL
) RETURNS public.solicitudes_cambio_cita LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.resolver_cambio_cita_audit(p_solicitud_id, 'paciente', p_paciente_id, p_accion, p_fecha_hora_contraoferta, NULL);
$$;
CREATE OR REPLACE FUNCTION public.resolver_cambio_cita_seguro(
  p_solicitud_id bigint, p_medico_id bigint, p_aceptar boolean, p_usuario_id bigint
) RETURNS public.solicitudes_cambio_cita LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.resolver_cambio_cita_audit(p_solicitud_id, 'medico', p_medico_id,
    CASE WHEN p_aceptar THEN 'aceptar' WHEN NOT p_aceptar THEN 'rechazar' ELSE NULL END, NULL, p_usuario_id);
$$;

-- Replace legacy 004/005 implementations too. Old names cannot bypass the guards.
CREATE OR REPLACE FUNCTION public.solicitar_cambio_cita(
  p_cita_id bigint, p_paciente_id bigint, p_medico_solicitado_id bigint,
  p_fecha_hora_solicitada timestamptz, p_duracion_minutos integer DEFAULT 30, p_motivo text DEFAULT NULL
) RETURNS public.solicitudes_cambio_cita LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.solicitar_cambio_cita_seguro(p_cita_id, p_paciente_id, p_medico_solicitado_id,
    p_fecha_hora_solicitada, p_duracion_minutos, p_motivo, NULL);
$$;
CREATE OR REPLACE FUNCTION public.proponer_cambio_cita(
  p_cita_id bigint, p_medico_id bigint, p_fecha_hora_solicitada timestamptz, p_motivo text DEFAULT NULL
) RETURNS public.solicitudes_cambio_cita LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.proponer_cambio_cita_seguro(p_cita_id, p_medico_id, p_fecha_hora_solicitada, p_motivo);
$$;
CREATE OR REPLACE FUNCTION public.resolver_propuesta_cita_paciente(
  p_solicitud_id bigint, p_paciente_id bigint, p_accion text, p_fecha_hora_contraoferta timestamptz DEFAULT NULL
) RETURNS public.solicitudes_cambio_cita LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.resolver_propuesta_cita_paciente_seguro(p_solicitud_id, p_paciente_id, p_accion, p_fecha_hora_contraoferta);
$$;
CREATE OR REPLACE FUNCTION public.resolver_cambio_cita(
  p_solicitud_id bigint, p_medico_id bigint, p_aceptar boolean, p_usuario_id bigint
) RETURNS public.solicitudes_cambio_cita LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.resolver_cambio_cita_seguro(p_solicitud_id, p_medico_id, p_aceptar, p_usuario_id);
$$;

REVOKE ALL ON FUNCTION public.solicitar_cambio_cita(bigint,bigint,bigint,timestamptz,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proponer_cambio_cita(bigint,bigint,timestamptz,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolver_cambio_cita(bigint,bigint,boolean,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolver_propuesta_cita_paciente(bigint,bigint,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solicitar_cambio_cita_seguro(bigint,bigint,bigint,timestamptz,integer,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proponer_cambio_cita_seguro(bigint,bigint,timestamptz,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolver_cambio_cita_seguro(bigint,bigint,boolean,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolver_propuesta_cita_paciente_seguro(bigint,bigint,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolver_cambio_cita_audit(bigint,text,bigint,text,timestamptz,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambiar_estado_cita(bigint,text,bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_medicos_cambio(bigint,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_cita_al_guardar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_reserva_al_guardar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cerrar_reservas_cita() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_cita_validada(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_espacio_cita(bigint,timestamptz,integer,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificar_nueva_cita() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reemplazar_horario_medico(bigint,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_cambio_cita(bigint,bigint,bigint,timestamptz,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.proponer_cambio_cita(bigint,bigint,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_cambio_cita(bigint,bigint,boolean,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_propuesta_cita_paciente(bigint,bigint,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.solicitar_cambio_cita_seguro(bigint,bigint,bigint,timestamptz,integer,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.proponer_cambio_cita_seguro(bigint,bigint,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_cambio_cita_seguro(bigint,bigint,boolean,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_propuesta_cita_paciente_seguro(bigint,bigint,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_cambio_cita_audit(bigint,text,bigint,text,timestamptz,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_cita(bigint,text,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bloquear_medicos_cambio(bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_cita_al_guardar() TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_reserva_al_guardar() TO service_role;
GRANT EXECUTE ON FUNCTION public.cerrar_reservas_cita() TO service_role;
GRANT EXECUTE ON FUNCTION public.crear_cita_validada(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_espacio_cita(bigint,timestamptz,integer,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.notificar_nueva_cita() TO service_role;
GRANT EXECUTE ON FUNCTION public.reemplazar_horario_medico(bigint,text,jsonb) TO service_role;
COMMIT;
