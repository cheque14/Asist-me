-- Add the rescheduled state to the verified appointment status constraint.
-- The existing allowed values are retained; no other constraint is modified.

ALTER TABLE public.citas
  DROP CONSTRAINT IF EXISTS citas_estado_check,
  ADD CONSTRAINT citas_estado_check
  CHECK (
    (estado)::text = ANY (
      ARRAY[
        'pendiente'::character varying,
        'confirmada'::character varying,
        'cancelada'::character varying,
        'completada'::character varying,
        'reprogramada'::character varying
      ]::text[]
    )
  );
