# backend/app.py
import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from database import supabase, sign_in_with_password, sign_up, request_auth_email_change, AuthEmailChangeError

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        resp = make_response("", 200)
        origin = request.headers.get("Origin") or "*"
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        resp.headers["Access-Control-Allow-Headers"] = request.headers.get("Access-Control-Request-Headers") or "Content-Type, Authorization"
        resp.headers["Access-Control-Max-Age"] = "3600"
        return resp


@app.before_request
def log_all_auth():
    if request.path.startswith("/api/auth"):
        print(f"\n[BEFORE REQUEST] {request.method} {request.path}")





def obtener_usuario_aplicacion(email):
    respuesta = (
        supabase.table("usuarios")
        .select("id, nombres, apellidos, username, email, telefono, correo_pendiente, rol")
        .eq("email", email)
        .execute()
    )
    if not respuesta.data:
        return None

    usuario = respuesta.data[0]
    perfil_id = None
    if usuario["rol"] == "paciente":
        perfil = (
            supabase.table("pacientes")
            .select("id")
            .eq("usuario_id", usuario["id"])
            .execute()
        )
    elif usuario["rol"] == "medico":
        perfil = (
            supabase.table("medicos")
            .select("id")
            .eq("usuario_id", usuario["id"])
            .execute()
        )
    else:
        perfil = None

    if perfil and perfil.data:
        perfil_id = perfil.data[0]["id"]

    return {
        "id": usuario["id"],
        "nombres": usuario["nombres"],
        "apellidos": usuario["apellidos"],
        "nombre": f"{usuario.get('nombres') or ''} {usuario.get('apellidos') or ''}".strip(),
        "username": usuario["username"],
        "email": usuario["email"],
        "correo_pendiente": usuario.get("correo_pendiente"),
        "telefono": usuario.get("telefono"),
        "rol": usuario["rol"],
        "perfil_id": perfil_id,
    }


def obtener_token_sesion(auth_response):
    session = getattr(auth_response, "session", None)
    return getattr(session, "access_token", None)


def autenticar_peticion():
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None, (jsonify({"error": "Se requiere una sesión válida"}), 401)

    try:
        auth_user = supabase.auth.get_user(authorization.removeprefix("Bearer ").strip())
        email = getattr(getattr(auth_user, "user", None), "email", None)
        usuario = obtener_usuario_aplicacion(email) if email else None
        if not usuario:
            return None, (jsonify({"error": "La sesión no corresponde a un usuario de Asist-me"}), 401)
        return usuario, None
    except Exception:
        return None, (jsonify({"error": "La sesión no es válida o expiró"}), 401)


def validar_horarios(horarios):
    if not isinstance(horarios, list) or len(horarios) > 42:
        raise ValueError("Envía una lista de hasta 42 bloques de horario.")

    normalizados = []
    por_dia = {}
    for bloque in horarios:
        if not isinstance(bloque, dict):
            raise ValueError("Cada bloque de horario debe ser un objeto.")
        try:
            dia = int(bloque["dia_semana"])
            inicio = time.fromisoformat(bloque["hora_inicio"])
            fin = time.fromisoformat(bloque["hora_fin"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("Cada bloque necesita día, hora de inicio y hora de fin válidos.")

        if dia < 0 or dia > 6:
            raise ValueError("El día de la semana debe estar entre 0 (lunes) y 6 (domingo).")
        if inicio.tzinfo is not None or fin.tzinfo is not None:
            raise ValueError("Las horas del horario deben ser horas locales sin offset.")
        if inicio.second or inicio.microsecond or fin.second or fin.microsecond:
            raise ValueError("Las horas deben especificarse en formato HH:MM.")
        if inicio >= fin:
            raise ValueError("La hora de fin debe ser posterior a la hora de inicio.")

        start_minutes = inicio.hour * 60 + inicio.minute
        end_minutes = fin.hour * 60 + fin.minute
        bloques_dia = por_dia.setdefault(dia, [])
        if any(start_minutes < existing_end and end_minutes > existing_start
               for existing_start, existing_end in bloques_dia):
            raise ValueError("Los bloques de un mismo día no pueden superponerse.")
        bloques_dia.append((start_minutes, end_minutes))
        normalizados.append({
            "dia_semana": dia,
            "hora_inicio": inicio.strftime("%H:%M"),
            "hora_fin": fin.strftime("%H:%M"),
        })

    return normalizados


def validar_telefono(valor):
    telefono = re.sub(r"[\s().-]", "", str(valor or ""))
    if not re.fullmatch(r"\+?\d{8,15}", telefono):
        raise ValueError("Ingresa un teléfono válido con 8 a 15 dígitos.")
    return telefono


def error_disponibilidad_cita(error):
    """Expose known booking validation failures without database internals."""
    detail = str(error)
    for message in (
        "Día no laboral", "Horario fuera de atención", "Horario ocupado o reservado",
        "La nueva fecha y hora deben ser futuras", "La fecha y hora deben ser futuras",
    ):
        if message in detail:
            return jsonify({"error": message}), 409
    return None


def parsear_fecha_iso(valor):
    try:
        return date.fromisoformat(valor)
    except (TypeError, ValueError):
        raise ValueError("La fecha debe tener formato YYYY-MM-DD.")


# ---------------------------------------- ------------
# 1. AUTENTICACIÓN: LOGIN
# ----------------------------------------------------
@app.route("/api/auth/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        resp = make_response("", 200)
        origin = request.headers.get("Origin") or "*"
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = request.headers.get("Access-Control-Request-Headers") or "Content-Type, Authorization"
        resp.headers["Access-Control-Max-Age"] = "3600"
        return resp
    datos = request.get_json(silent=True) or {}
    if not isinstance(datos, dict):
        return jsonify({"error": "Revisa los datos del perfil"}), 400
    identificador = datos.get("identificador", datos.get("email", "")).strip().lower()
    password = datos.get("password", "")

    if not identificador or not password:
        return jsonify({"error": "Usuario/correo y contraseña requeridos"}), 400

    try:
        usuarios_query = supabase.table("usuarios").select(
            "id, nombres, apellidos, username, email, rol, password_hash"
        )
        if "@" in identificador:
            usuario_existente = usuarios_query.eq("email", identificador).execute().data
        else:
            usuario_existente = usuarios_query.eq("username", identificador).execute().data

        if not usuario_existente:
            return jsonify({"error": "Usuario/correo o contraseña incorrectos"}), 401
        usuario_existente = usuario_existente[0]
        email = usuario_existente["email"]

        try:
            auth_response = sign_in_with_password({
                "email": email,
                "password": password,
            })
        except Exception as auth_error:

            detalle_auth = str(auth_error).lower()

            # Si el usuario existe en Auth pero no está confirmado, lo auto-confirmamos con service_role
            if "email not confirmed" in detalle_auth or "not confirmed" in detalle_auth or "confirm" in detalle_auth:
                try:
                    users = supabase.auth.admin.list_users()
                    user_to_confirm = None
                    for u in getattr(users, "users", []) or []:
                        if getattr(u, "email", None) and getattr(u, "email").lower() == email:
                            user_to_confirm = u
                            break
                    if user_to_confirm and getattr(user_to_confirm, "id", None):
                        supabase.auth.admin.update_user_by_id(user_to_confirm.id, {"email_confirm": True})
                        auth_response = sign_in_with_password({
                            "email": email,
                            "password": password,
                        })
                    else:
                        return jsonify({"error": "Debes confirmar tu correo electrónico. Revisa tu bandeja de entrada o spam."}), 403
                except Exception as confirm_error:
                    return jsonify({"error": "Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada."}), 403
            else:
                app.logger.warning("Authentication attempt failed")

            legacy_rows = (
                supabase.table("usuarios")
                .select("id, nombres, apellidos, username, email, rol, password_hash")
                .eq("email", email)
                .execute()
            ).data
            if not legacy_rows or legacy_rows[0].get("password_hash") != password:
                return jsonify({"error": "Usuario/correo o contraseña incorrectos"}), 401

            legacy_user = legacy_rows[0]
            if len(password) < 6:
                return jsonify({
                    "error": "Esta cuenta usa una contraseña antigua. Debes actualizarla a una contraseña de al menos 6 caracteres."
                }), 400
            try:
                supabase.auth.admin.create_user({
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {
                        "nombre": f"{legacy_user.get('nombres') or ''} {legacy_user.get('apellidos') or ''}".strip(),
                        "nombres": legacy_user["nombres"],
                        "apellidos": legacy_user["apellidos"],
                        "username": legacy_user["username"],
                    },
                })
                auth_response = sign_in_with_password({
                    "email": email,
                    "password": password,
                })
                supabase.table("usuarios").update(
                    {"password_hash": None}
                ).eq("id", legacy_user["id"]).execute()
            except Exception as error:
                return jsonify({
                    "error": "No se pudo migrar esta cuenta a la autenticación segura. "
                    "Inténtalo de nuevo o contacta al administrador."
                }), 500

        session_token = obtener_token_sesion(auth_response)
        auth_user = getattr(auth_response, "user", None)
        user_email = getattr(auth_user, "email", None)
        usuario = obtener_usuario_aplicacion(user_email or email)
        if not usuario:
            return jsonify({
                "error": "La cuenta existe en Supabase Auth, pero no tiene un perfil en Asist-me."
            }), 403
        if not session_token:
            return jsonify({"error": "Supabase Auth no devolvió una sesión válida"}), 401

        return jsonify({
            "mensaje": "Inicio de sesión exitoso",
            "usuario": usuario,
            "access_token": session_token,
        })

    except Exception as e:
        return jsonify({"error": "No se pudo iniciar sesión"}), 500



@app.route("/api/auth/register", methods=["POST"])
def register():
    datos = request.get_json() or {}
    nombres = datos.get("nombres", "").strip()
    apellidos = datos.get("apellidos", "").strip()
    username = datos.get("username", "").strip().lower()
    nombre = f"{nombres} {apellidos}".strip()
    email = datos.get("email", "").strip().lower()
    password = datos.get("password", "")
    rol = datos.get("rol", "paciente")
    telefono = None

    if not email or not password or not nombres or not apellidos or not username:
        return jsonify({"error": "Todos los campos son obligatorios"}), 400
    if len(password) < 6:
        return jsonify({"error": "La contraseña debe tener al menos 6 caracteres"}), 400
    if not re.fullmatch(r"[a-z0-9._-]{3,30}", username):
        return jsonify({
            "error": "El nombre de usuario debe tener entre 3 y 30 caracteres; usa letras, números, punto, guion o guion bajo."
        }), 400
    if rol not in ("paciente", "medico"):
        return jsonify({"error": "El rol seleccionado no es válido"}), 400
    if rol == "paciente":
        try:
            telefono = validar_telefono(datos.get("telefono"))
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
    especialidad_id = None
    if rol == "medico":
        try:
            especialidad_id = int(datos.get("especialidad_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "Selecciona una especialidad médica válida"}), 400

    try:
        existente = (
            supabase.table("usuarios")
            .select("id")
            .eq("email", email)
            .execute()
        )
        if existente.data:
            return jsonify({"error": "El correo ya está registrado"}), 409

        existente_username = (
            supabase.table("usuarios")
            .select("id")
            .ilike("username", username)
            .execute()
        )
        if existente_username.data:
            return jsonify({"error": "Ese nombre de usuario ya está en uso"}), 409

        auth_response = sign_up({
            "email": email,
            "password": password,
            "options": {"data": {
                "nombre": nombre,
                "nombres": nombres,
                "apellidos": apellidos,
                "username": username,
                "telefono": telefono,
                "rol": rol,
            }},
        })

        res_usuario = supabase.table("usuarios").insert({
            "nombres": nombres,
            "apellidos": apellidos,
            "username": username,
            "email": email,
            "telefono": telefono,
            "rol": rol
        }).execute()

        if not res_usuario.data:
            return jsonify({"error": "No se pudo crear el perfil de usuario"}), 500

        nuevo_usuario = res_usuario.data[0]
        usuario_id = nuevo_usuario["id"]
        perfil_id = None

        if rol == "paciente":
            res_p = supabase.table("pacientes").insert({
                "usuario_id": usuario_id
            }).execute()
            if res_p.data:
                perfil_id = res_p.data[0]["id"]
        elif rol == "medico":
            res_m = supabase.table("medicos").insert({
                "usuario_id": usuario_id,
                "especialidad_id": especialidad_id,
                "licencia_medica": datos.get("licencia_medica", "LIC-PENDIENTE"),
                "zona_horaria": datos.get("zona_horaria", "UTC"),
            }).execute()
            if res_m.data:
                perfil_id = res_m.data[0]["id"]

        usuario = {
            "id": usuario_id,
            "nombre": nombre,
            "nombres": nombres,
            "apellidos": apellidos,
            "username": username,
            "email": email,
            "telefono": telefono,
            "rol": rol,
            "perfil_id": perfil_id,
        }
        session_token = obtener_token_sesion(auth_response)
        return jsonify({
            "mensaje": "Registro completado con éxito",
            "usuario": usuario,
            "access_token": session_token,
            "requiere_confirmacion": not bool(session_token),
        })

    except Exception as e:
        print(f"Error en registro: {e}")
        detalle = str(e).lower()
        if "rate limit" in detalle:
            return jsonify({
                "error": "Supabase alcanzó el límite temporal de correos de confirmación. Espera unos minutos e inténtalo de nuevo."
            }), 429
        if "password" in detalle and ("6" in detalle or "weak" in detalle):
            return jsonify({"error": "La contraseña debe tener al menos 6 caracteres"}), 400
        return jsonify({"error": "No se pudo completar el registro"}), 500


@app.route("/api/auth/me", methods=["GET"])
def obtener_sesion():
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return jsonify({"error": "Se requiere una sesión válida"}), 401

    try:
        auth_user = supabase.auth.get_user(authorization.removeprefix("Bearer ").strip())
        email = getattr(getattr(auth_user, "user", None), "email", None)
        if not email:
            return jsonify({"error": "La sesión no es válida"}), 401

        usuario = obtener_usuario_aplicacion(email)
        if not usuario:
            return jsonify({"error": "El usuario no tiene un perfil en Asist-me"}), 403
        return jsonify({"usuario": usuario})
    except Exception:
        return jsonify({"error": "La sesión no es válida o expiró"}), 401


@app.route("/api/auth/profile", methods=["PUT"])
def actualizar_perfil():
    usuario, error = autenticar_peticion()
    if error:
        return error

    datos = request.get_json() or {}
    nombres = datos.get("nombres", "")
    apellidos = datos.get("apellidos", "")
    email = datos.get("email", "")
    if not all(isinstance(value, str) for value in (nombres, apellidos, email)):
        return jsonify({"error": "Revisa los datos del perfil"}), 400
    nombres, apellidos = nombres.strip(), apellidos.strip()
    email = email.strip().lower()
    if not nombres or not apellidos:
        return jsonify({"error": "El nombre y los apellidos son obligatorios"}), 400
    if len(nombres) > 100 or len(apellidos) > 100 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return jsonify({"error": "Revisa el nombre, los apellidos y el correo electrónico"}), 400
    try:
        telefono_input = datos.get("telefono")
        telefono = validar_telefono(telefono_input) if str(telefono_input or "").strip() else None
    except ValueError as validation_error:
        return jsonify({"error": str(validation_error)}), 400

    correo_pendiente = usuario.get("correo_pendiente")
    if correo_pendiente and email != correo_pendiente:
        return jsonify({"error": "Confirma o cancela primero el cambio de correo pendiente"}), 409
    cambio_email = email != usuario["email"] and email != correo_pendiente
    reintentar_confirmacion = (
        datos.get("reintentar_confirmacion") is True
        and correo_pendiente
        and email == correo_pendiente
    )
    try:
        if cambio_email:
            duplicado = (supabase.table("usuarios").select("id").eq("email", email).execute())
            if any(row["id"] != usuario["id"] for row in (duplicado.data or [])):
                return jsonify({"error": "El correo ya está registrado"}), 409

        if cambio_email:
            supabase.table("usuarios").update({"correo_pendiente": email}).eq("id", usuario["id"]).execute()

        if cambio_email or reintentar_confirmacion:
            token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
            try:
                request_auth_email_change(token, email)
            except Exception as auth_error:
                status_code = getattr(auth_error, "status_code", None)
                if cambio_email and isinstance(auth_error, AuthEmailChangeError) and status_code and status_code < 500:
                    supabase.table("usuarios").update({"correo_pendiente": None}).eq("id", usuario["id"]).execute()
                    return jsonify({"error": "No se aceptó el cambio de correo. Revisa la dirección e intenta nuevamente."}), 409
                print(f"Error al solicitar confirmación de correo: {auth_error}")
                return jsonify({
                    "error": "No se pudo confirmar el resultado del cambio. El correo quedó pendiente; revisa tu bandeja o reenvía la confirmación.",
                    "usuario": {**usuario, "correo_pendiente": email},
                }), 503
            correo_pendiente = email if cambio_email else correo_pendiente

        actualizacion = {"nombres": nombres, "apellidos": apellidos, "telefono": telefono}
        usuario.update({
            "nombres": nombres, "apellidos": apellidos,
            "nombre": f"{nombres} {apellidos}", "telefono": telefono,
            "correo_pendiente": correo_pendiente,
        })
        return jsonify({"mensaje": "Perfil actualizado", "usuario": usuario})
    except Exception as update_error:
        print(f"Error actualizando perfil: {update_error}")
        message = str(update_error)
        if "already registered" in message.lower() or "already been registered" in message.lower():
            return jsonify({"error": "El correo ya está registrado"}), 409
        return jsonify({"error": "No se pudo actualizar el perfil"}), 500


@app.route("/api/medico/horarios", methods=["GET", "PUT"])
def gestionar_horarios_medico():
    usuario, error = autenticar_peticion()
    if error:
        return error
    if usuario["rol"] != "medico" or not usuario["perfil_id"]:
        return jsonify({"error": "Solo un médico puede gestionar sus horarios"}), 403

    medico_id = usuario["perfil_id"]
    if request.method == "GET":
        try:
            medico = (
                supabase.table("medicos")
                .select("zona_horaria")
                .eq("id", medico_id)
                .single()
                .execute()
            ).data
            horarios = (
                supabase.table("horarios_medico")
                .select("dia_semana, hora_inicio, hora_fin")
                .eq("medico_id", medico_id)
                .order("dia_semana")
                .order("hora_inicio")
                .execute()
            ).data
            return jsonify({
                "zona_horaria": medico["zona_horaria"],
                "horarios": horarios,
            })
        except Exception as error:
            print(f"Error consultando horarios médicos: {error}")
            return jsonify({"error": "No se pudieron consultar los horarios"}), 500

    datos = request.get_json(silent=True) or {}
    if not isinstance(datos, dict):
        return jsonify({"error": "El cuerpo de la solicitud debe ser un objeto JSON"}), 400
    zona_horaria = datos.get("zona_horaria", "")
    if not isinstance(zona_horaria, str) or not zona_horaria.strip():
        return jsonify({"error": "Selecciona una zona horaria"}), 400
    zona_horaria = zona_horaria.strip()
    try:
        ZoneInfo(zona_horaria)
        horarios = validar_horarios(datos.get("horarios"))
    except (ValueError, ZoneInfoNotFoundError) as error:
        return jsonify({"error": str(error) or "La zona horaria no es válida"}), 400

    try:
        supabase.rpc("reemplazar_horario_medico", {
            "p_medico_id": medico_id,
            "p_zona_horaria": zona_horaria,
            "p_horarios": horarios,
        }).execute()
        return jsonify({"mensaje": "Horario guardado", "zona_horaria": zona_horaria, "horarios": horarios})
    except Exception as error:
        print(f"Error guardando horario médico: {error}")
        error_text = str(error).lower()
        if "horarios_medico_dia_semana_check" in error_text:
            return jsonify({
                "error": "La base de datos rechaza el formato de día usado por el calendario. Ejecuta backend/migrations/007_horarios_dia_semana_range.sql y vuelve a guardar."
            }), 409
        if "reemplazar_horario_medico" in error_text and any(
            marker in error_text for marker in ("function", "schema cache", "pgrst202")
        ):
            return jsonify({
                "error": "Falta instalar la función para guardar horarios. Aplica backend/migrations/003_horarios_medicos.sql y vuelve a intentar."
            }), 503
        return jsonify({"error": "No se pudo guardar el horario"}), 500


@app.route("/api/medicos/<int:medico_id>/disponibilidad", methods=["GET"])
def obtener_disponibilidad_medico(medico_id):
    fecha_param = request.args.get("fecha")
    tipo_cita_param = request.args.get("tipo_cita_id")
    if not fecha_param or not tipo_cita_param:
        return jsonify({"error": "Se requieren fecha y tipo_cita_id"}), 400
    try:
        fecha = parsear_fecha_iso(fecha_param)
        tipo_cita_id = int(tipo_cita_param)
        if tipo_cita_id < 1:
            raise ValueError("El tipo de cita no es válido.")
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    try:
        medico = (
            supabase.table("medicos")
            .select("zona_horaria")
            .eq("id", medico_id)
            .single()
            .execute()
        ).data
        zona = ZoneInfo(medico["zona_horaria"])
        ahora_local = datetime.now(zona).date()
        if fecha < ahora_local:
            return jsonify({"error": "No se pueden consultar fechas pasadas"}), 400

        tipo_cita = (
            supabase.table("tipos_cita_medico")
            .select("id, duracion_minutos")
            .eq("id", tipo_cita_id)
            .eq("medico_id", medico_id)
            .single()
            .execute()
        ).data
        duracion = int(30 if tipo_cita.get("duracion_minutos") is None else tipo_cita["duracion_minutos"])
        if duracion < 1:
            raise ValueError("La duración del tipo de cita no es válida.")

        bloques = (
            supabase.table("horarios_medico")
            .select("hora_inicio, hora_fin")
            .eq("medico_id", medico_id)
            .eq("dia_semana", fecha.weekday())
            .order("hora_inicio")
            .execute()
        ).data

        inicio_dia = datetime.combine(fecha, time.min, tzinfo=zona)
        fin_dia = datetime.combine(fecha + timedelta(days=1), time.min, tzinfo=zona)
        ahora_utc = datetime.now(timezone.utc)
        citas = (
            supabase.table("citas")
            .select("fecha_hora, tipo_cita_id, estado")
            .eq("medico_id", medico_id)
            .gte("fecha_hora", (inicio_dia.astimezone(timezone.utc) - timedelta(days=1)).isoformat())
            .lt("fecha_hora", fin_dia.astimezone(timezone.utc).isoformat())
            .execute()
        ).data

        citas_activas = [
            cita for cita in citas
            if (cita.get("estado") or "").strip().lower()
            not in {"cancelada", "cancelado", "canceled", "cancelled", "anulada", "anulado", "rechazada", "rejected"}
        ]
        tipos_existentes = {
            cita.get("tipo_cita_id") for cita in citas_activas
            if cita.get("tipo_cita_id") is not None
        }
        duraciones = {}
        if tipos_existentes:
            tipos = (
                supabase.table("tipos_cita_medico")
                .select("id, duracion_minutos")
                .in_("id", list(tipos_existentes))
                .eq("medico_id", medico_id)
                .execute()
            ).data
            duraciones = {tipo["id"]: int(30 if tipo.get("duracion_minutos") is None else tipo["duracion_minutos"])
                          for tipo in tipos}

        ocupadas = []
        for cita in citas_activas:
            cita_tipo = cita.get("tipo_cita_id")
            if cita_tipo is not None and cita_tipo not in duraciones:
                raise ValueError("Una cita existente no tiene un tipo de cita válido.")
            inicio_cita = datetime.fromisoformat(cita["fecha_hora"].replace("Z", "+00:00"))
            if inicio_cita.tzinfo is None:
                inicio_cita = inicio_cita.replace(tzinfo=timezone.utc)
            fin_cita = inicio_cita + timedelta(minutes=duraciones.get(cita_tipo, 30))
            ocupadas.append((inicio_cita, fin_cita))

        # Reservations can start before this day and still overlap its first block.
        reservas = (supabase.table("solicitudes_cambio_cita")
                    .select("fecha_hora_solicitada, duracion_minutos")
                    .eq("medico_solicitado_id", medico_id)
                    .in_("estado", ["pendiente", "pendiente_paciente", "pendiente_medico"])
                    .gte("fecha_hora_solicitada", (inicio_dia.astimezone(timezone.utc) - timedelta(days=1)).isoformat())
                    .lt("fecha_hora_solicitada", fin_dia.astimezone(timezone.utc).isoformat())
                    .execute()).data or []
        for reserva in reservas:
            inicio_reserva = datetime.fromisoformat(reserva["fecha_hora_solicitada"].replace("Z", "+00:00"))
            if inicio_reserva.tzinfo is None:
                inicio_reserva = inicio_reserva.replace(tzinfo=timezone.utc)
            ocupadas.append((inicio_reserva, inicio_reserva + timedelta(minutes=int(reserva["duracion_minutos"]))))

        disponibles = []
        for bloque in bloques:
            hora_inicio = time.fromisoformat(bloque["hora_inicio"])
            hora_fin = time.fromisoformat(bloque["hora_fin"])
            cursor_local = datetime.combine(fecha, hora_inicio)
            fin_bloque_local = datetime.combine(fecha, hora_fin)
            fin_bloque_utc = fin_bloque_local.replace(tzinfo=zona).astimezone(timezone.utc)
            while cursor_local + timedelta(minutes=duracion) <= fin_bloque_local:
                inicio_local = cursor_local.replace(tzinfo=zona)
                inicio_utc = inicio_local.astimezone(timezone.utc)
                fin_utc = inicio_utc + timedelta(minutes=duracion)
                fin_candidato = fin_utc.astimezone(zona)
                hora_local_valida = inicio_utc.astimezone(zona).replace(tzinfo=None) == cursor_local
                hay_conflicto = any(
                    inicio_utc < ocupada_fin and fin_utc > ocupada_inicio
                    for ocupada_inicio, ocupada_fin in ocupadas
                )
                if (
                    hora_local_valida
                    and fin_utc <= fin_bloque_utc
                    and inicio_utc > ahora_utc
                    and not hay_conflicto
                ):
                    disponibles.append({
                        "inicio": inicio_local.isoformat(),
                        "fin": fin_candidato.isoformat(),
                    })
                cursor_local += timedelta(minutes=duracion)

        return jsonify({
            "medico_id": medico_id,
            "fecha": fecha.isoformat(),
            "zona_horaria": medico["zona_horaria"],
            "tipo_cita_id": tipo_cita_id,
            "duracion_minutos": duracion,
            "disponibles": disponibles,
        })
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        print(f"Error consultando disponibilidad: {error}")
        return jsonify({"error": "No se pudo consultar la disponibilidad"}), 500


# ----------------------------------------------------
# OBTENER ESPECIALIDADES DESDE SUPABASE
# ----------------------------------------------------
@app.route("/api/especialidades", methods=["GET"])
def obtener_especialidades():
    try:
        # Consulta SELECT id, nombre FROM especialidades ORDER BY id ASC
        response = supabase.table("especialidades").select("id, nombre").order("id", desc=False).execute()
        return jsonify(response.data)
    except Exception as e:
        print(f"⚠️ Error consultando especialidades en Supabase: {e}")
        return jsonify({"error": str(e)}), 500




# ----------------------------------------------------
# OBTENER MEDICOS REGISTRADOS
# ----------------------------------------------------
@app.route("/api/medicos", methods=["GET"])
def listar_medicos():
    try:
        # Read the profile row without assuming every optional column has been migrated.
        medicos_resp = supabase.table("medicos").select("*").execute()
        medicos = medicos_resp.data or []
        if not medicos:
            return jsonify([])

        user_ids = [m["usuario_id"] for m in medicos if m.get("usuario_id")]
        usuarios_resp = supabase.table("usuarios").select("*").in_("id", user_ids).execute()
        usuarios_map = {u["id"]: u for u in (usuarios_resp.data or [])}

        try:
            espec_resp = supabase.table("especialidades").select("*").execute()
            espec_map = {e["id"]: e["nombre"] for e in (espec_resp.data or [])}
        except Exception as specialty_error:
            print(f"Aviso: no se pudieron resolver especialidades médicas: {specialty_error}")
            espec_map = {}

        resultado = []
        for m in medicos:
            u = usuarios_map.get(m["usuario_id"], {})
            nombre_partes = f"{u.get('nombres') or ''} {u.get('apellidos') or ''}".strip()
            nombre = nombre_partes or u.get("username") or u.get("email") or f"Médico #{m['id']}"
            if not nombre.lower().startswith("dr"):
                nombre = f"Dr. {nombre}"
            resultado.append({
                "id": m["id"],
                "usuario_id": m["usuario_id"],
                "nombre": nombre,
                "email": u.get("email"),
                "especialidad": espec_map.get(m["especialidad_id"], "Medicina General"),
                "especialidad_id": m.get("especialidad_id"),
                "licencia_medica": m.get("licencia_medica"),
                "zona_horaria": m.get("zona_horaria", "UTC"),
            })
        return jsonify(resultado)
    except Exception as e:
        print(f"Error listando medicos: {e}")
        return jsonify({"error": "No se pudieron obtener los médicos"}), 500


# ----------------------------------------------------
# CITAS MÉDICAS (LISTAR, CREAR, ESTADOS, CAMBIOS, CANCELAR)
# ----------------------------------------------------
ESTADOS_CITA = {"pendiente", "confirmada", "cancelada", "reprogramada", "rechazada", "completada"}
ESTADOS_CITA_CANCELADOS = {"cancelada", "rechazada", "completada"}


def normalizar_fecha_hora_cita(valor):
    if not isinstance(valor, str) or not valor.strip():
        raise ValueError("La fecha y hora de la cita son obligatorias")
    valor = valor.strip()
    try:
        fecha_hora = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("La fecha y hora deben tener formato ISO válido")
    if fecha_hora.tzinfo is None:
        fecha_hora = fecha_hora.replace(tzinfo=timezone.utc)
    fecha_hora = fecha_hora.astimezone(timezone.utc)
    if fecha_hora <= datetime.now(timezone.utc):
        raise ValueError("La fecha y hora de la cita deben ser futuras")
    return fecha_hora.isoformat()


def convertir_horario_consultorio_a_utc(fecha, hora, zona_horaria):
    """Resolve clinic wall-clock input without using the patient's device zone."""
    if not isinstance(fecha, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha):
        raise ValueError("Selecciona una fecha de cita válida")
    if not isinstance(hora, str) or not re.fullmatch(r"\d{2}:\d{2}", hora):
        raise ValueError("Selecciona una hora de cita válida")
    try:
        local = datetime.combine(date.fromisoformat(fecha), time.fromisoformat(hora))
    except ValueError:
        raise ValueError("La fecha u hora de la cita no es válida")
    try:
        zona = ZoneInfo(zona_horaria)
    except (ZoneInfoNotFoundError, TypeError, ValueError):
        raise ValueError("La zona horaria del consultorio no está configurada correctamente")

    # Reject DST gaps and repeated times instead of silently shifting a booking.
    candidates = set()
    for fold in (0, 1):
        utc = local.replace(tzinfo=zona, fold=fold).astimezone(timezone.utc)
        if utc.astimezone(zona).replace(tzinfo=None) == local:
            candidates.add(utc)
    if not candidates:
        raise ValueError("La hora elegida no existe por un cambio de horario del consultorio. Elige otra hora.")
    if len(candidates) > 1:
        raise ValueError("La hora elegida es ambigua por un cambio de horario del consultorio. Elige otra hora.")
    return candidates.pop().isoformat()


def validar_estado_cita(valor):
    estado = str(valor or "").strip().lower()
    if estado not in ESTADOS_CITA:
        raise ValueError("El estado de la cita no es válido")
    return estado


def normalizar_horario_cambio(datos, medico_id):
    """Use only the database physician zone for local pairs; keep legacy ISO input."""
    local = "fecha_local" in datos or "hora_local" in datos
    if not local:
        return normalizar_fecha_hora_cita(datos.get("fecha_hora"))
    if "fecha_hora" in datos:
        raise ValueError("Envía fecha y hora del consultorio o fecha_hora, no ambas")
    if not datos.get("fecha_local") or not datos.get("hora_local"):
        raise ValueError("Selecciona fecha y hora del consultorio")
    medicos = (supabase.table("medicos").select("zona_horaria")
               .eq("id", medico_id).execute()).data or []
    if not medicos:
        raise ValueError("Médico no encontrado")
    return normalizar_fecha_hora_cita(convertir_horario_consultorio_a_utc(
        datos["fecha_local"], datos["hora_local"], medicos[0].get("zona_horaria")
    ))


def error_workflow_cita(error):
    """Fail closed if migration 011 is absent; never expose database diagnostics."""
    detail = str(error)
    if any(marker in detail.lower() for marker in ("pgrst202", "pgrst203", "42883", "schema cache", "does not exist")):
        return jsonify({"error": "Aplica backend/migrations/011_audit_workflow_fixes.sql antes de modificar citas."}), 503
    availability = error_disponibilidad_cita(error)
    if availability:
        return availability
    for message, status in (
        ("La cita no existe o no te pertenece", 404),
        ("Una cita finalizada no puede reabrirse", 409),
        ("No se puede modificar una cita finalizada", 409),
        ("La solicitud ya fue resuelta o no pertenece a la cita actual", 409),
        ("La cita ya tiene una propuesta pendiente", 409),
        ("Tipo de cita no válido para el médico", 400),
        ("La acción no es válida", 400),
        ("La propuesta no existe o ya fue resuelta", 409),
        ("No tienes permiso para cambiar el estado", 403),
    ):
        if message in detail:
            return jsonify({"error": message}), status
    return jsonify({"error": "No se pudo modificar la cita"}), 500


@app.route("/api/citas", methods=["GET"])
def listar_citas():
    usuario, error = autenticar_peticion()
    if error:
        return error

    rol = usuario["rol"]
    perfil_id = usuario.get("perfil_id")

    if not perfil_id:
        if rol == "paciente":
            p = supabase.table("pacientes").select("id").eq("usuario_id", usuario["id"]).execute()
            if p.data:
                perfil_id = p.data[0]["id"]
            else:
                creado = supabase.table("pacientes").insert({"usuario_id": usuario["id"]}).execute()
                perfil_id = creado.data[0]["id"] if creado.data else None
        elif rol == "medico":
            m = supabase.table("medicos").select("id").eq("usuario_id", usuario["id"]).execute()
            if m.data:
                perfil_id = m.data[0]["id"]

    if not perfil_id:
        return jsonify([])

    try:
        query = supabase.table("citas").select("*")
        if rol == "paciente":
            query = query.eq("paciente_id", perfil_id)
        else:
            query = query.eq("medico_id", perfil_id)

        citas_resp = query.order("fecha_hora", desc=False).execute()
        citas = citas_resp.data or []
        if not citas:
            return jsonify([])

        solicitudes_map = {}
        try:
            solicitudes = (
                supabase.table("solicitudes_cambio_cita")
                .select("id, cita_id, medico_solicitado_id, fecha_hora_solicitada, estado, motivo, solicitante_rol")
                .in_("cita_id", [c["id"] for c in citas])
                .in_("estado", ["pendiente", "pendiente_paciente", "pendiente_medico"])
                .execute()
            ).data or []
            solicitudes_map = {s["cita_id"]: s for s in solicitudes}
        except Exception as solicitud_error:
            print(f"Aviso: no se pudieron cargar solicitudes de cambio: {solicitud_error}")

        medico_ids = list({c["medico_id"] for c in citas if c.get("medico_id")} |
                          {s["medico_solicitado_id"] for s in solicitudes_map.values() if s.get("medico_solicitado_id")})
        paciente_ids = list({c["paciente_id"] for c in citas if c.get("paciente_id")})

        medicos_map = {}
        if medico_ids:
            try:
                meds = supabase.table("medicos").select("*").in_("id", medico_ids).execute().data or []
                m_user_ids = [m["usuario_id"] for m in meds if m.get("usuario_id")]
                u_meds = supabase.table("usuarios").select("*").in_("id", m_user_ids).execute().data or []
                u_med_map = {str(u["id"]): u for u in u_meds}
                try:
                    esp_data = supabase.table("especialidades").select("*").execute().data or []
                    esp_map = {e["id"]: e["nombre"] for e in esp_data}
                except Exception as specialty_error:
                    print(f"Aviso: no se pudieron resolver especialidades de citas: {specialty_error}")
                    esp_map = {}
                for m in meds:
                    u = u_med_map.get(str(m.get("usuario_id")), {})
                    nomb = f"{u.get('nombres') or ''} {u.get('apellidos') or ''}".strip() or u.get("email") or u.get("username") or f"Médico #{m['id']}"
                    if not nomb.lower().startswith("dr"):
                        nomb = f"Dr. {nomb}"
                    medicos_map[m["id"]] = {
                        "nombre": nomb,
                        "especialidad": esp_map.get(m.get("especialidad_id"), "Medicina General"),
                        "zona_horaria": m.get("zona_horaria"),
                    }
            except Exception as physician_error:
                print(f"Aviso: no se pudieron resolver médicos de citas: {physician_error}")

        pacientes_map = {}
        if paciente_ids:
            try:
                pacs = supabase.table("pacientes").select("*").in_("id", paciente_ids).execute().data or []
                p_user_ids = [p["usuario_id"] for p in pacs if p.get("usuario_id")]
                u_pacs = supabase.table("usuarios").select("*").in_("id", p_user_ids).execute().data or []
                u_pac_map = {str(u["id"]): u for u in u_pacs}
                for p in pacs:
                    u = u_pac_map.get(str(p.get("usuario_id")), {})
                    pacientes_map[p["id"]] = {
                        "nombre": f"{u.get('nombres') or ''} {u.get('apellidos') or ''}".strip() or u.get("email") or "Paciente",
                        "email": u.get("email", ""),
                        "telefono": u.get("telefono") or "",
                    }
            except Exception as patient_error:
                print(f"Aviso: no se pudieron resolver pacientes de citas: {patient_error}")

        resultado = []
        for c in citas:
            med_info = medicos_map.get(c.get("medico_id"), {})
            pac_info = pacientes_map.get(c.get("paciente_id"), {})
            solicitud = solicitudes_map.get(c["id"])
            if solicitud:
                solicitud = {**solicitud, "zona_horaria": medicos_map.get(
                    solicitud.get("medico_solicitado_id"), {}).get("zona_horaria")}
            resultado.append({
                "id": c["id"],
                "fecha_hora": c["fecha_hora"],
                "estado": c.get("estado", "pendiente"),
                "medico_id": c.get("medico_id"),
                "paciente_id": c.get("paciente_id"),
                "persona_atendida_id": c.get("persona_atendida_id"),
                "zona_horaria": med_info.get("zona_horaria"),
                "medico_nombre": med_info.get("nombre", "Médico Especialista"),
                "especialidad": med_info.get("especialidad", "Medicina General"),
                "paciente_nombre": pac_info.get("nombre", "Paciente"),
                "paciente_email": pac_info.get("email", ""),
                "paciente_telefono": pac_info.get("telefono", ""),
                "motivo": c.get("motivo") or c.get("notas"),
                "es_para_otra_persona": bool(c.get("es_para_otra_persona")),
                "beneficiario_nombre": c.get("beneficiario_nombre"),
                "beneficiario_telefono": c.get("beneficiario_telefono"),
                "created_at": c.get("created_at"),
                "solicitud_cambio": solicitud,
            })
        return jsonify(resultado)
    except Exception as e:
        print(f"Error listando citas: {e}")
        # The appointment rows are still useful when an optional enrichment table
        # (notifications/change requests/profile joins) is not migrated yet.
        try:
            return jsonify([
                {
                    "id": cita.get("id"),
                    "fecha_hora": cita.get("fecha_hora"),
                    "estado": cita.get("estado", "pendiente"),
                    "medico_id": cita.get("medico_id"),
                    "paciente_id": cita.get("paciente_id"),
                    "persona_atendida_id": cita.get("persona_atendida_id"),
                    "zona_horaria": None,
                    "medico_nombre": "Médico Especialista",
                    "especialidad": "Medicina General",
                    "paciente_nombre": "Paciente",
                    "paciente_email": "",
                    "paciente_telefono": "",
                    "motivo": cita.get("motivo") or cita.get("notas"),
                    "solicitud_cambio": None,
                }
                for cita in citas
            ])
        except Exception:
            return jsonify({"error": "No se pudieron obtener las citas"}), 500


@app.route("/api/citas", methods=["POST"])
def crear_cita():
    usuario, error = autenticar_peticion()
    if error:
        return error

    datos = request.get_json(silent=True) or {}
    if not isinstance(datos, dict):
        return jsonify({"error": "Envía los datos de la cita como un objeto"}), 400
    medico_id = datos.get("medico_id")
    fecha_hora = datos.get("fecha_hora")
    horario_local = "fecha_local" in datos or "hora_local" in datos

    if horario_local and fecha_hora:
        return jsonify({"error": "Envía fecha y hora del consultorio o fecha_hora, no ambas"}), 400
    if horario_local and (not datos.get("fecha_local") or not datos.get("hora_local")):
        return jsonify({"error": "Selecciona fecha y hora del consultorio"}), 400
    if not medico_id or (not fecha_hora and not horario_local):
        return jsonify({"error": "Se requieren medico_id y fecha_hora"}), 400

    para_otra_persona = datos.get("es_para_otra_persona", False)
    if not isinstance(para_otra_persona, bool):
        return jsonify({"error": "Indica si la cita es para otra persona"}), 400
    beneficiario_nombre = str(datos.get("beneficiario_nombre") or "").strip()
    beneficiario_telefono = str(datos.get("beneficiario_telefono") or "").strip()
    motivo = str(datos.get("motivo") or "").strip()
    if not motivo:
        return jsonify({"error": "El motivo de la cita es obligatorio"}), 400
    if para_otra_persona and (not beneficiario_nombre or not beneficiario_telefono):
        return jsonify({"error": "Para una cita de otra persona se requiere nombre y teléfono"}), 400

    rol = usuario["rol"]
    paciente_id = None
    if rol == "paciente":
        paciente_id = usuario.get("perfil_id")
        if not paciente_id:
            p = supabase.table("pacientes").select("id").eq("usuario_id", usuario["id"]).execute()
            if p.data:
                paciente_id = p.data[0]["id"]
            else:
                creado = supabase.table("pacientes").insert({"usuario_id": usuario["id"]}).execute()
                paciente_id = creado.data[0]["id"] if creado.data else None
    else:
        paciente_id = datos.get("paciente_id")

    if not paciente_id:
        return jsonify({"error": "No se pudo determinar el paciente para la cita"}), 400

    try:
        # A physician cannot create their own clinical-access relationship by
        # inserting a confirmed appointment for an arbitrary patient account.
        if rol == "medico":
            if para_otra_persona or int(medico_id) != usuario.get("perfil_id"):
                return jsonify({"error": "La primera cita de esta persona debe solicitarla el paciente"}), 403
            existing_care = (supabase.table("citas").select("id")
                             .eq("paciente_id", int(paciente_id)).eq("medico_id", usuario["perfil_id"])
                             .eq("es_para_otra_persona", False)
                             .in_("estado", ["confirmada", "reprogramada", "completada"])
                             .limit(1).execute()).data or []
            if not existing_care:
                return jsonify({"error": "La primera cita de esta persona debe solicitarla el paciente"}), 403

        attended_id = datos.get("persona_atendida_id")
        if attended_id is not None:
            if type(attended_id) is not int or not 0 < attended_id <= 9223372036854775807:
                return jsonify({"error": "Selecciona una persona registrada válida"}), 400
            subjects = (supabase.table("personas_atendidas")
                        .select("id,paciente_id,tipo,nombre,telefono").eq("id", attended_id)
                        .eq("paciente_id", int(paciente_id)).execute()).data or []
            if not subjects or subjects[0]["paciente_id"] != int(paciente_id) or (
                subjects[0]["tipo"] == "beneficiario"
            ) != para_otra_persona:
                return jsonify({"error": "La persona seleccionada no corresponde a esta cuenta y cita"}), 403
            if para_otra_persona:
                beneficiario_nombre = subjects[0]["nombre"]
                beneficiario_telefono = subjects[0].get("telefono") or beneficiario_telefono

        if horario_local:
            medico = (supabase.table("medicos").select("zona_horaria")
                      .eq("id", int(medico_id)).execute()).data
            if not medico:
                return jsonify({"error": "Médico no encontrado"}), 404
            fecha_hora = convertir_horario_consultorio_a_utc(
                datos["fecha_local"], datos["hora_local"], medico[0].get("zona_horaria")
            )
        fecha_str = normalizar_fecha_hora_cita(fecha_hora)

        if rol not in ("paciente", "medico"):
            return jsonify({"error": "El rol no puede crear citas"}), 403

        servicio_id = None
        if datos.get("servicio_id") not in (None, ""):
            try:
                servicio_id = int(datos["servicio_id"])
            except (TypeError, ValueError):
                return jsonify({"error": "Selecciona un servicio válido"}), 400
            if servicio_id <= 0:
                return jsonify({"error": "Selecciona un servicio válido"}), 400
            servicio = (
                supabase.table("servicios_medico")
                .select("id")
                .eq("id", servicio_id)
                .eq("medico_id", int(medico_id))
                .execute()
            )
            if not servicio.data:
                return jsonify({"error": "El servicio seleccionado no pertenece al médico elegido"}), 400

        nueva_cita = {
            "paciente_id": int(paciente_id),
            "medico_id": int(medico_id),
            "fecha_hora": fecha_str,
            "estado": "confirmada" if rol == "medico" else "pendiente",
            "motivo": motivo,
            "es_para_otra_persona": para_otra_persona,
            "beneficiario_nombre": beneficiario_nombre if para_otra_persona else None,
            "beneficiario_telefono": beneficiario_telefono if para_otra_persona else None,
        }
        if servicio_id is not None:
            nueva_cita["servicio_id"] = servicio_id
        if attended_id is not None:
            nueva_cita["persona_atendida_id"] = attended_id
        if datos.get("tipo_cita_id"):
            nueva_cita["tipo_cita_id"] = int(datos["tipo_cita_id"])

        res = supabase.rpc("crear_cita_validada", {"p_datos": nueva_cita}).execute()
        if res.data:
            cita = res.data[0] if isinstance(res.data, list) else res.data
            return jsonify({"mensaje": "Cita agendada con éxito", "cita": cita}), 201
        return jsonify({"error": "No se pudo agendar la cita"}), 500
    except Exception as e:
        print(f"Error creando cita: {e}")
        detalle = str(e)
        for mensaje in ("Día no laboral", "Horario fuera de atención", "Horario ocupado o reservado"):
            if mensaje in detalle:
                return jsonify({"error": mensaje}), 409
        if "crear_cita_validada" in detalle and any(
            marker in detalle.lower() for marker in ("pgrst202", "not found", "schema cache", "does not exist")
        ):
            return jsonify({"error": "Aplica backend/migrations/010_citas_disponibilidad_notificaciones.sql antes de agendar citas."}), 503
        if isinstance(e, ValueError):
            return jsonify({"error": str(e)}), 400
        return jsonify({"error": f"Error al agendar cita: {str(e)}"}), 500


@app.route("/api/notificaciones", methods=["GET"])
def listar_notificaciones():
    usuario, error = autenticar_peticion()
    if error:
        return error
    try:
        data = (
            supabase.table("notificaciones")
            .select("id, cita_id, tipo, mensaje, leida, creado_en")
            .eq("usuario_id", usuario["id"])
            .order("creado_en", desc=True)
            .execute()
        ).data or []
        return jsonify(data)
    except Exception as notification_error:
        return jsonify({"error": "No se pudieron cargar las notificaciones. Intenta de nuevo."}), 503


def obtener_cita_de_solicitud(solicitud_id, propietario_columna, propietario_id):
    try:
        rows = (
            supabase.table("solicitudes_cambio_cita")
            .select("cita_id")
            .eq("id", solicitud_id)
            .eq(propietario_columna, propietario_id)
            .limit(1)
            .execute()
        ).data or []
        return rows[0].get("cita_id") if rows else None
    except Exception as lookup_error:
        print(f"Aviso: no se pudo relacionar la solicitud con su cita: {lookup_error}")
        return None


def marcar_notificaciones_de_cita_leidas(usuario_id, cita_id):
    if not usuario_id or not cita_id:
        return False
    try:
        (
            supabase.table("notificaciones")
            .update({"leida": True})
            .eq("usuario_id", usuario_id)
            .eq("cita_id", cita_id)
            .eq("leida", False)
            .execute()
        )
        return True
    except Exception as update_error:
        print(f"Aviso: no se pudieron cerrar notificaciones de la cita: {update_error}")
        return False


@app.route("/api/notificaciones/no-leidas/count", methods=["GET"])
def contar_notificaciones_no_leidas():
    usuario, error = autenticar_peticion()
    if error:
        return error
    try:
        data = (
            supabase.table("notificaciones")
            .select("id")
            .eq("usuario_id", usuario["id"])
            .eq("leida", False)
            .execute()
        ).data or []
        return jsonify({"count": len(data)})
    except Exception as notification_error:
        print(f"Aviso: no se pudieron contar notificaciones sin leer: {notification_error}")
        return jsonify({"error": "No se pudo consultar el estado de las notificaciones"}), 500


@app.route("/api/notificaciones/<int:notificacion_id>/leer", methods=["PUT"])
def marcar_notificacion_leida(notificacion_id):
    usuario, error = autenticar_peticion()
    if error:
        return error
    try:
        supabase.table("notificaciones").update({"leida": True}) \
            .eq("id", notificacion_id).eq("usuario_id", usuario["id"]).execute()
        return jsonify({"mensaje": "Notificación marcada como leída"})
    except Exception as notification_error:
        print(f"Aviso: no se pudo marcar la notificación como leída: {notification_error}")
        return jsonify({"error": "No se pudo actualizar la notificación"}), 500


@app.route("/api/citas/<int:cita_id>/estado", methods=["PUT"])
def actualizar_estado_cita(cita_id):
    usuario, error = autenticar_peticion()
    if error:
        return error
    if usuario["rol"] != "medico" or not usuario.get("perfil_id"):
        return jsonify({"error": "Solo el médico asignado puede cambiar el estado"}), 403

    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return jsonify({"error": "El cuerpo de la solicitud debe ser un objeto JSON"}), 400
    try:
        estado = validar_estado_cita(datos.get("estado"))
    except ValueError as validation_error:
        return jsonify({"error": str(validation_error)}), 400
    if estado == "reprogramada":
        return jsonify({"error": "Usa una solicitud de cambio aceptada para reprogramar la cita"}), 400

    try:
        actualizado = supabase.rpc("cambiar_estado_cita", {
            "p_cita_id": cita_id, "p_rol": usuario["rol"],
            "p_perfil_id": usuario["perfil_id"], "p_estado": estado,
        }).execute().data
        cita = actualizado[0] if isinstance(actualizado, list) and actualizado else actualizado
        if not cita:
            return jsonify({"error": "No se pudo actualizar el estado"}), 409
        return jsonify({"mensaje": "Estado actualizado", "cita": cita})
    except Exception as update_error:
        return error_workflow_cita(update_error)


@app.route("/api/citas/<int:cita_id>/solicitudes-cambio", methods=["POST"])
def solicitar_cambio_cita(cita_id):
    usuario, error = autenticar_peticion()
    if error:
        return error
    if usuario["rol"] != "paciente" or not usuario.get("perfil_id"):
        return jsonify({"error": "Solo el paciente dueño puede solicitar cambios"}), 403

    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return jsonify({"error": "El cuerpo de la solicitud debe ser un objeto JSON"}), 400
    try:
        medico_id = int(datos.get("medico_id"))
        if medico_id < 1:
            raise ValueError("El médico seleccionado no es válido")
        fecha_hora = normalizar_horario_cambio(datos, medico_id)
        tipo_id = int(datos["tipo_cita_id"]) if datos.get("tipo_cita_id") is not None else None
        if tipo_id is not None and tipo_id < 1:
            raise ValueError("Selecciona un tipo de cita válido")
        duracion = int(datos.get("duracion_minutos", 30))
        if duracion < 1 or duracion > 1440:
            raise ValueError("La duración de la cita no es válida")
    except (TypeError, ValueError) as validation_error:
        return jsonify({"error": str(validation_error)}), 400

    except Exception as lookup_error:
        return error_workflow_cita(lookup_error)

    try:
        solicitud = (
            supabase.rpc("solicitar_cambio_cita_seguro", {
                "p_cita_id": cita_id,
                "p_paciente_id": usuario["perfil_id"],
                "p_medico_solicitado_id": medico_id,
                "p_fecha_hora_solicitada": fecha_hora,
                "p_duracion_minutos": duracion,
                "p_tipo_cita_id": tipo_id,
                "p_motivo": datos.get("motivo"),
            }).execute()
        ).data
        return jsonify({"mensaje": "Solicitud enviada; queda reservada hasta la decisión del médico", "solicitud": solicitud}), 201
    except Exception as request_error:
        return error_workflow_cita(request_error)


@app.route("/api/citas/<int:cita_id>/propuestas-cambio", methods=["POST"])
def proponer_cambio_cita(cita_id):
    usuario, error = autenticar_peticion()
    if error:
        return error
    if usuario["rol"] != "medico" or not usuario.get("perfil_id"):
        return jsonify({"error": "Solo el médico asignado puede proponer cambios"}), 403
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return jsonify({"error": "El cuerpo de la solicitud debe ser un objeto JSON"}), 400
    try:
        fecha_hora = normalizar_horario_cambio(datos, usuario["perfil_id"])
    except ValueError as validation_error:
        return jsonify({"error": str(validation_error)}), 400
    except Exception as lookup_error:
        return error_workflow_cita(lookup_error)
    try:
        propuesta = supabase.rpc("proponer_cambio_cita_seguro", {
            "p_cita_id": cita_id,
            "p_medico_id": usuario["perfil_id"],
            "p_fecha_hora_solicitada": fecha_hora,
            "p_motivo": datos.get("motivo"),
        }).execute().data
        return jsonify({"mensaje": "Propuesta enviada al paciente", "solicitud": propuesta}), 201
    except Exception as proposal_error:
        return error_workflow_cita(proposal_error)


@app.route("/api/citas/propuestas-cambio/<int:solicitud_id>/resolver", methods=["PUT"])
def resolver_propuesta_cita_paciente(solicitud_id):
    usuario, error = autenticar_peticion()
    if error:
        return error
    if usuario["rol"] != "paciente" or not usuario.get("perfil_id"):
        return jsonify({"error": "Solo el paciente dueño puede responder"}), 403
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return jsonify({"error": "El cuerpo de la solicitud debe ser un objeto JSON"}), 400
    accion = datos.get("accion")
    if accion not in ("aceptar", "rechazar", "contraofertar"):
        return jsonify({"error": "La acción no es válida"}), 400
    fecha_hora = None
    if accion == "contraofertar":
        try:
            medico_id = None
            if "fecha_local" in datos or "hora_local" in datos:
                rows = (supabase.table("solicitudes_cambio_cita").select("medico_solicitado_id")
                        .eq("id", solicitud_id).eq("paciente_id", usuario["perfil_id"]).execute()).data or []
                if not rows:
                    return jsonify({"error": "La propuesta no existe o ya fue resuelta"}), 404
                medico_id = rows[0]["medico_solicitado_id"]
            fecha_hora = normalizar_horario_cambio(datos, medico_id)
        except ValueError as validation_error:
            return jsonify({"error": str(validation_error)}), 400
        except Exception as lookup_error:
            return error_workflow_cita(lookup_error)
    try:
        cita_id = obtener_cita_de_solicitud(solicitud_id, "paciente_id", usuario["perfil_id"])
        respuesta = supabase.rpc("resolver_propuesta_cita_paciente_seguro", {
            "p_solicitud_id": solicitud_id,
            "p_paciente_id": usuario["perfil_id"],
            "p_accion": accion,
            "p_fecha_hora_contraoferta": fecha_hora,
        }).execute().data
        notificaciones_leidas = marcar_notificaciones_de_cita_leidas(usuario["id"], cita_id)
        return jsonify({
            "mensaje": "Respuesta registrada",
            "solicitud": respuesta,
            "notificaciones_leidas": notificaciones_leidas,
        })
    except Exception as response_error:
        return error_workflow_cita(response_error)


@app.route("/api/citas/solicitudes-cambio", methods=["GET"])
def listar_solicitudes_cambio():
    usuario, error = autenticar_peticion()
    if error:
        return error
    if usuario["rol"] != "medico" or not usuario.get("perfil_id"):
        return jsonify({"error": "Solo un médico puede consultar solicitudes"}), 403
    try:
        solicitudes = (
            supabase.table("solicitudes_cambio_cita")
            .select("*")
            .eq("medico_actual_id", usuario["perfil_id"])
            .in_("estado", ["pendiente", "pendiente_medico"])
            .order("creado_en")
            .execute()
        ).data or []
        doctor_ids = list({row["medico_solicitado_id"] for row in solicitudes if row.get("medico_solicitado_id")})
        doctors = (supabase.table("medicos").select("id, zona_horaria")
                   .in_("id", doctor_ids).execute()).data if doctor_ids else []
        zones = {doctor["id"]: doctor.get("zona_horaria") for doctor in (doctors or [])}
        solicitudes = [{**row, "zona_horaria": zones.get(row.get("medico_solicitado_id"))} for row in solicitudes]
        return jsonify(solicitudes)
    except Exception as request_error:
        print(f"Error listando solicitudes de cambio: {request_error}")
        return jsonify({"error": "No se pudieron consultar las solicitudes"}), 500


@app.route("/api/citas/solicitudes-cambio/<int:solicitud_id>/resolver", methods=["PUT"])
def resolver_solicitud_cambio(solicitud_id):
    usuario, error = autenticar_peticion()
    if error:
        return error
    if usuario["rol"] != "medico" or not usuario.get("perfil_id"):
        return jsonify({"error": "Solo el médico asignado puede resolver solicitudes"}), 403
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return jsonify({"error": "El cuerpo de la solicitud debe ser un objeto JSON"}), 400
    aceptar = datos.get("aceptar")
    if not isinstance(aceptar, bool):
        return jsonify({"error": "Indica si aceptas la solicitud"}), 400
    try:
        cita_id = obtener_cita_de_solicitud(solicitud_id, "medico_actual_id", usuario["perfil_id"])
        solicitud = (
            supabase.rpc("resolver_cambio_cita_seguro", {
                "p_solicitud_id": solicitud_id,
                "p_medico_id": usuario["perfil_id"],
                "p_aceptar": aceptar,
                "p_usuario_id": usuario["id"],
            }).execute()
        ).data
        notificaciones_leidas = marcar_notificaciones_de_cita_leidas(usuario["id"], cita_id)
        return jsonify({
            "mensaje": "Solicitud aceptada" if aceptar else "Solicitud rechazada",
            "solicitud": solicitud,
            "notificaciones_leidas": notificaciones_leidas,
        })
    except Exception as resolve_error:
        return error_workflow_cita(resolve_error)


@app.route("/api/citas/<int:cita_id>/cancelar", methods=["PUT"])
def cancelar_cita(cita_id):
    usuario, error = autenticar_peticion()
    if error:
        return error
    if usuario["rol"] not in ("paciente", "medico") or not usuario.get("perfil_id"):
        return jsonify({"error": "No tienes permiso para cancelar esta cita"}), 403
    try:
        resultado = supabase.rpc("cambiar_estado_cita", {
            "p_cita_id": cita_id, "p_rol": usuario["rol"],
            "p_perfil_id": usuario["perfil_id"], "p_estado": "cancelada",
        }).execute().data
        cita = resultado[0] if isinstance(resultado, list) and resultado else resultado
        if not cita:
            return jsonify({"error": "No se pudo cancelar la cita"}), 409
        return jsonify({"mensaje": "Cita cancelada con éxito", "cita": cita})
    except Exception as cancel_error:
        return error_workflow_cita(cancel_error)


# ----------------------------------------------------
# SERVICIOS MÉDICOS
# ----------------------------------------------------
@app.route("/api/servicios", methods=["GET"])
def listar_servicios():
    try:
        res = supabase.table("servicios_medico").select("*").execute()
        servicios = res.data or []
        if not servicios:
            return jsonify([])

        medico_ids = list({s["medico_id"] for s in servicios if s.get("medico_id")})
        med_map = {}
        if medico_ids:
            meds = supabase.table("medicos").select("id, usuario_id, especialidad_id").in_("id", medico_ids).execute().data or []
            u_ids = [m["usuario_id"] for m in meds if m.get("usuario_id")]
            u_data = supabase.table("usuarios").select("id, nombres, apellidos").in_("id", u_ids).execute().data or []
            u_map = {u["id"]: u for u in u_data}
            esp_data = supabase.table("especialidades").select("id, nombre").execute().data or []
            esp_map = {e["id"]: e["nombre"] for e in esp_data}
            for m in meds:
                u = u_map.get(m["usuario_id"], {})
                nomb = f"{u.get('nombres') or ''} {u.get('apellidos') or ''}".strip() or "Médico"
                if not nomb.lower().startswith("dr"):
                    nomb = f"Dr. {nomb}"
                med_map[m["id"]] = {
                    "nombre": nomb,
                    "especialidad": esp_map.get(m["especialidad_id"], "Medicina General")
                }

        resultado = []
        for s in servicios:
            m_info = med_map.get(s.get("medico_id"), {})
            resultado.append({
                "id": s["id"],
                "medico_id": s.get("medico_id"),
                "servicio": s.get("nombre_servicio"),
                "descripcion": s.get("descripcion", ""),
                "precio": str(s.get("precio") or "0.00"),
                "medico": m_info.get("nombre", "Especialista"),
                "especialidad": m_info.get("especialidad", "Medicina General")
            })
        return jsonify(resultado)
    except Exception as e:
        print(f"Error listando servicios: {e}")
        return jsonify({"error": "No se pudieron obtener los servicios"}), 500


@app.route("/api/servicios", methods=["POST"])
def crear_servicio():
    usuario, error = autenticar_peticion()
    if error:
        return error
    if usuario["rol"] != "medico" or not usuario.get("perfil_id"):
        return jsonify({"error": "Solo un médico puede publicar servicios"}), 403

    datos = request.get_json(silent=True) or {}
    nombre = datos.get("servicio") or datos.get("nombre_servicio")
    precio = datos.get("precio")
    if not nombre:
        return jsonify({"error": "El nombre del servicio es obligatorio"}), 400

    try:
        nuevo = {
            "medico_id": usuario["perfil_id"],
            "nombre_servicio": nombre.strip(),
            "descripcion": datos.get("descripcion", "").strip(),
            "precio": float(precio) if precio else 0.0
        }
        res = supabase.table("servicios_medico").insert(nuevo).execute()
        return jsonify({"mensaje": "Servicio creado", "servicio": res.data[0] if res.data else None}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ----------------------------------------------------
# CHATBOT CON HISTORIAL
# ----------------------------------------------------
@app.route("/api/chat", methods=["POST"])
def chat():
    usuario, error = autenticar_peticion()
    if error:
        return error
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return jsonify({"error": "El cuerpo de la solicitud debe ser un objeto JSON"}), 400
    mensaje = datos.get("mensaje")
    if not isinstance(mensaje, str) or not mensaje.strip() or len(mensaje.strip()) > 2000:
        return jsonify({"error": "Envía un mensaje de entre 1 y 2000 caracteres"}), 400
    mensaje = mensaje.strip()

    texto_lower = mensaje.lower()
    if "cita" in texto_lower or "agendar" in texto_lower:
        respuesta = "Para agendar una cita, usa 'Nueva cita' o 'Agendar cita' y elige médico y horario disponible."
    elif "espacio" in texto_lower or "disponib" in texto_lower or "horario" in texto_lower:
        respuesta = "Consulta los horarios de cada médico al agendar. Las horas corresponden a la zona horaria del consultorio."
    elif "receta" in texto_lower or "medic" in texto_lower:
        respuesta = "Soy un asistente administrativo: no emito recetas, diagnósticos ni indicaciones de medicamentos. Consulta a tu médico para atención clínica."
    elif "hola" in texto_lower or "buenos" in texto_lower:
        respuesta = "¡Hola! Soy el asistente administrativo de Asist-me. Puedo orientarte sobre citas y horarios."
    else:
        respuesta = "Puedo orientarte sobre citas y horarios. No realizo diagnósticos ni emito recetas; para consultas clínicas, contacta a tu médico."

    try:
        supabase.table("historial_chat").insert({
            "usuario_id": usuario["id"],
            "mensaje_usuario": mensaje,
            "respuesta_bot": respuesta,
        }).execute()
    except Exception:
        # History storage is best-effort; the response makes no persistence claim.
        app.logger.warning("Chat history storage unavailable")
    return jsonify({"respuesta": respuesta})



try:
    from backend.clinical_records import register_clinical_routes
except ModuleNotFoundError:
    from clinical_records import register_clinical_routes

register_clinical_routes(app, lambda: supabase, lambda: autenticar_peticion())


if __name__ == '__main__':
    app.run(debug=False, port=5001)
