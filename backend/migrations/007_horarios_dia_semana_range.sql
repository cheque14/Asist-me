-- Keep persisted weekdays aligned with Python's weekday() and the UI's Monday=0 model.
ALTER TABLE public.horarios_medico
  DROP CONSTRAINT IF EXISTS horarios_medico_dia_semana_check,
  ADD CONSTRAINT horarios_medico_dia_semana_check
    CHECK (dia_semana BETWEEN 0 AND 6);
