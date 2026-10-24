ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS nombres text,
ADD COLUMN IF NOT EXISTS apellidos text,
ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_username_lower_unique
ON public.usuarios (lower(username))
WHERE username IS NOT NULL;
