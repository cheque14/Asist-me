ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS correo_pendiente text;

CREATE OR REPLACE FUNCTION public.sincronizar_correo_confirmado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.usuarios
       SET email = NEW.email,
           correo_pendiente = NULL
     WHERE lower(email) = lower(OLD.email)
       AND lower(correo_pendiente) = lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sincronizar_correo_confirmado ON auth.users;
CREATE TRIGGER sincronizar_correo_confirmado
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_correo_confirmado();
