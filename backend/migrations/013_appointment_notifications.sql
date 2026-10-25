-- Apply after 011 (and 012 for the clinical module), in the intended database.
-- No historical notifications are rewritten or backfilled.
BEGIN;

DO $$ BEGIN
  IF to_regclass('public.solicitudes_cambio_cita') IS NULL
     OR to_regclass('public.notificaciones') IS NULL
     OR to_regprocedure('public.cambiar_estado_cita(bigint,text,bigint,text)') IS NULL THEN
    RAISE EXCEPTION 'Faltan migraciones previas: verifica la base correcta y aplica hasta 011 antes de 013';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notificar_evento_cita(
  p_cita_id bigint, p_actor_rol text, p_actor_perfil bigint, p_evento text,
  p_solicitud_id bigint DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cita public.citas;
  solicitud public.solicitudes_cambio_cita;
  actor_usuario bigint;
  paciente_usuario bigint;
  medico_usuario bigint;
  medico_anterior_usuario bigint;
  zona text;
  fecha timestamptz;
  mensaje text;
  actor_nombre text;
BEGIN
  SELECT * INTO cita FROM public.citas WHERE id = p_cita_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cita no encontrada para notificar'; END IF;
  IF p_solicitud_id IS NOT NULL THEN
    SELECT * INTO solicitud FROM public.solicitudes_cambio_cita
      WHERE id = p_solicitud_id AND cita_id = p_cita_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada para notificar'; END IF;
  END IF;
  SELECT p.usuario_id INTO paciente_usuario FROM public.pacientes p WHERE p.id = cita.paciente_id;
  SELECT m.usuario_id, m.zona_horaria INTO medico_usuario, zona
    FROM public.medicos m WHERE m.id = cita.medico_id;
  IF p_actor_rol = 'paciente' AND p_actor_perfil = cita.paciente_id THEN
    actor_usuario := paciente_usuario;
    actor_nombre := 'El paciente';
  ELSIF p_actor_rol = 'medico' AND p_actor_perfil IN (cita.medico_id, solicitud.medico_actual_id) THEN
    SELECT m.usuario_id INTO actor_usuario FROM public.medicos m WHERE m.id = p_actor_perfil;
    actor_nombre := 'El médico';
  ELSE
    RAISE EXCEPTION 'Actor no válido para la notificación';
  END IF;
  IF actor_usuario IS NULL OR paciente_usuario IS NULL OR medico_usuario IS NULL THEN
    RAISE EXCEPTION 'Destinatario no encontrado para notificar';
  END IF;
  fecha := cita.fecha_hora;
  IF p_solicitud_id IS NOT NULL THEN
    fecha := solicitud.fecha_hora_solicitada;
    SELECT m.zona_horaria INTO zona FROM public.medicos m WHERE m.id = solicitud.medico_solicitado_id;
    IF solicitud.estado = 'aceptada' THEN
      SELECT m.usuario_id INTO medico_anterior_usuario FROM public.medicos m
        WHERE m.id = solicitud.medico_actual_id;
    END IF;
  END IF;
  -- A broken zone must not prevent cancellation; any fallback is explicit UTC.
  IF zona IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = zona) THEN
    zona := 'UTC';
  END IF;
  mensaje := CASE p_evento
    WHEN 'nueva_cita' THEN actor_nombre || CASE WHEN p_actor_rol = 'paciente'
      THEN ' solicitó una nueva cita.' ELSE ' agendó una nueva cita.' END
    WHEN 'estado_cita' THEN actor_nombre || CASE cita.estado
      WHEN 'confirmada' THEN ' confirmó la cita.'
      WHEN 'cancelada' THEN ' canceló la cita.'
      WHEN 'rechazada' THEN ' rechazó la cita.'
      WHEN 'completada' THEN ' marcó la cita como completada.'
      WHEN 'pendiente' THEN ' cambió la cita a pendiente.'
      ELSE ' actualizó el estado de la cita.' END
    WHEN 'solicitud_cambio' THEN 'El paciente solicitó cambiar la cita. Revisa la solicitud.'
    WHEN 'propuesta_cita' THEN 'El médico propuso otro horario. Revisa la propuesta.'
    WHEN 'contraoferta_cita' THEN 'El paciente propuso otro horario. Revisa la contraoferta.'
    WHEN 'cambio_aceptado' THEN actor_nombre || ' aceptó el cambio de cita.'
    WHEN 'cambio_rechazado' THEN actor_nombre || ' rechazó el cambio. La cita conserva su horario.'
    ELSE NULL END;
  IF mensaje IS NULL THEN RAISE EXCEPTION 'Evento de cita no válido'; END IF;
  mensaje := mensaje || ' ' || CASE WHEN p_solicitud_id IS NULL THEN 'Cita: ' ELSE 'Horario solicitado: ' END
    || to_char(fecha AT TIME ZONE zona, 'DD/MM/YYYY HH24:MI') || ' (' || zona || ').';

  -- UNION deduplicates overlapping participant roles. Never notify the actor.
  -- Any delivery error aborts the same transaction as the appointment mutation.
  INSERT INTO public.notificaciones(usuario_id, cita_id, tipo, mensaje, leida)
  SELECT destinatario, p_cita_id, p_evento, mensaje, false FROM (
    SELECT paciente_usuario AS destinatario
    UNION SELECT medico_usuario
    UNION SELECT medico_anterior_usuario
  ) AS destinatarios
  WHERE destinatario IS NOT NULL AND destinatario <> actor_usuario;
END;
$$;

CREATE OR REPLACE FUNCTION public.cambiar_estado_cita(
  p_cita_id bigint, p_rol text, p_perfil_id bigint, p_estado text
) RETURNS public.citas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cita_actual public.citas; estado_anterior text;
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
  estado_anterior := cita_actual.estado;
  -- The AFTER trigger releases ALL pending states in this same transaction.
  UPDATE public.citas SET estado = p_estado WHERE id = p_cita_id RETURNING * INTO cita_actual;
  IF p_estado IS DISTINCT FROM estado_anterior THEN
    PERFORM public.notificar_evento_cita(p_cita_id, p_rol, p_perfil_id, 'estado_cita');
  END IF;
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
  IF current_setting('asistme.propuesta_medico', true) IS DISTINCT FROM '1' THEN
    PERFORM public.notificar_evento_cita(p_cita_id, 'paciente', p_paciente_id, 'solicitud_cambio', solicitud.id);
  END IF;
  RETURN solicitud;
END;
$$;

CREATE OR REPLACE FUNCTION public.notificar_nueva_cita()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- The authenticated API fixes initial status: patient=pending, doctor=confirmed.
  -- Reuse the existing creation trigger rather than adding a second one.
  IF NEW.estado = 'pendiente' THEN
    PERFORM public.notificar_evento_cita(NEW.id, 'paciente', NEW.paciente_id, 'nueva_cita');
  ELSE
    PERFORM public.notificar_evento_cita(NEW.id, 'medico', NEW.medico_id, 'nueva_cita');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.proponer_cambio_cita_seguro(
  p_cita_id bigint, p_medico_id bigint, p_fecha_hora_solicitada timestamptz, p_motivo text DEFAULT NULL
) RETURNS public.solicitudes_cambio_cita LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cita_actual public.citas; solicitud public.solicitudes_cambio_cita; contexto_anterior text;
BEGIN
  SELECT * INTO cita_actual FROM public.citas WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND OR cita_actual.medico_id IS DISTINCT FROM p_medico_id OR p_medico_id IS NULL THEN
    RAISE EXCEPTION 'La cita no existe o no te pertenece';
  END IF;
  contexto_anterior := coalesce(current_setting('asistme.propuesta_medico', true), '');
  PERFORM set_config('asistme.propuesta_medico', '1', true);
  solicitud := public.solicitar_cambio_cita_seguro(p_cita_id, cita_actual.paciente_id,
    p_medico_id, p_fecha_hora_solicitada, 30, p_motivo, cita_actual.tipo_cita_id);
  PERFORM set_config('asistme.propuesta_medico', contexto_anterior, true);
  UPDATE public.solicitudes_cambio_cita SET solicitante_rol = 'medico', estado = 'pendiente_paciente'
  WHERE id = solicitud.id RETURNING * INTO solicitud;
  PERFORM public.notificar_evento_cita(p_cita_id, 'medico', p_medico_id, 'propuesta_cita', solicitud.id);
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
  PERFORM public.notificar_evento_cita(solicitud.cita_id, p_rol, p_perfil_id,
    CASE p_accion WHEN 'contraofertar' THEN 'contraoferta_cita'
      WHEN 'aceptar' THEN 'cambio_aceptado' ELSE 'cambio_rechazado' END, solicitud.id);
  RETURN solicitud;
END;
$$;


REVOKE ALL ON FUNCTION public.notificar_evento_cita(bigint,text,bigint,text,bigint),
  public.cambiar_estado_cita(bigint,text,bigint,text),
  public.solicitar_cambio_cita_seguro(bigint,bigint,bigint,timestamptz,integer,text,bigint),
  public.proponer_cambio_cita_seguro(bigint,bigint,timestamptz,text),
  public.resolver_cambio_cita_audit(bigint,text,bigint,text,timestamptz,bigint),
  public.notificar_nueva_cita() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notificar_evento_cita(bigint,text,bigint,text,bigint),
  public.cambiar_estado_cita(bigint,text,bigint,text),
  public.solicitar_cambio_cita_seguro(bigint,bigint,bigint,timestamptz,integer,text,bigint),
  public.proponer_cambio_cita_seguro(bigint,bigint,timestamptz,text),
  public.resolver_cambio_cita_audit(bigint,text,bigint,text,timestamptz,bigint),
  public.notificar_nueva_cita() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
