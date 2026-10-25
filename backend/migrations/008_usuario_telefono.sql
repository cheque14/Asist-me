-- Store patient contact numbers on the application account.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS telefono text;
