# backend/app.py
import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Flask, request, jsonify
from flask_cors import CORS
from database import supabase

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


def obtener_usuario_aplicacion(email):
    respuesta = (
        supabase.table("usuarios")
        .select("id, nombre, nombres, apellidos, username, email, rol")
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
        "nombre": usuario["nombre"],
        "nombres": usuario["nombres"],
        "apellidos": usuario["apellidos"],
        "username": usuario["username"],
        "email": usuario["email"],
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


def parsear_fecha_iso(valor):
    try:
        return date.fromisoformat(valor)
    except (TypeError, ValueError):
        raise ValueError("La fecha debe tener formato YYYY-MM-DD.")


# ----------------------------------------------------
# 1. AUTENTICACIÓN: LOGIN
# ----------------------------------------------------
@app.route("/api/auth/login", methods=["POST"])
def login():
    datos = request.get_json() or {}
    identificador = datos.get("identificador", datos.get("email", "")).strip().lower()
    password = datos.get("password", "")

    if not identificador or not password:
        return jsonify({"error": "Usuario/correo y contraseña requeridos"}), 400

    try:
        usuarios_query = supabase.table("usuarios").select(
            "id, nombre, nombres, apellidos, username, email, rol, password_hash"
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
            auth_response = supabase.auth.sign_in_with_password({
                "email": email,
                "password": password,
            })
        except Exception:
            legacy_rows = (
                supabase.table("usuarios")
                .select("id, nombre, nombres, apellidos, username, email, rol, password_hash")
                .eq("email", email)
                .execute()
            ).data
            if not legacy_rows or legacy_rows[0].get("password_hash") != password:
                return jsonify({"error": "Correo o contraseña incorrectos"}), 401

            legacy_user = legacy_rows[0]
            try:
                supabase.auth.admin.create_user({
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {
                        "nombre": legacy_user["nombre"],
                        "nombres": legacy_user["nombres"],
                        "apellidos": legacy_user["apellidos"],
                        "username": legacy_user["username"],
                    },
                })
                auth_response = supabase.auth.sign_in_with_password({
                    "email": email,
                    "password": password,
                })
                supabase.table("usuarios").update(
                    {"password_hash": None}
                ).eq("id", legacy_user["id"]).execute()
            except Exception as error:
                print(f"Error migrando usuario a Supabase Auth: {error}")
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
        print(f"Error en login: {e}")
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

    if not email or not password or not nombres or not apellidos or not username:
        return jsonify({"error": "Todos los campos son obligatorios"}), 400
    if not re.fullmatch(r"[a-z0-9._-]{3,30}", username):
        return jsonify({
            "error": "El nombre de usuario debe tener entre 3 y 30 caracteres; usa letras, números, punto, guion o guion bajo."
        }), 400
    if rol not in ("paciente", "medico"):
        return jsonify({"error": "El rol seleccionado no es válido"}), 400
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

        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {"data": {
                "nombre": nombre,
                "nombres": nombres,
                "apellidos": apellidos,
                "username": username,
                "rol": rol,
            }},
        })

        res_usuario = supabase.table("usuarios").insert({
            "nombre": nombre,
            "nombres": nombres,
            "apellidos": apellidos,
            "username": username,
            "email": email,
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
        duracion = int(tipo_cita["duracion_minutos"])
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
            .gte("fecha_hora", inicio_dia.astimezone(timezone.utc).isoformat())
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
            duraciones = {tipo["id"]: int(tipo["duracion_minutos"]) for tipo in tipos}

        ocupadas = []
        for cita in citas_activas:
            cita_tipo = cita.get("tipo_cita_id")
            if cita_tipo not in duraciones:
                raise ValueError("Una cita existente no tiene un tipo de cita válido.")
            inicio_cita = datetime.fromisoformat(cita["fecha_hora"].replace("Z", "+00:00"))
            if inicio_cita.tzinfo is None:
                inicio_cita = inicio_cita.replace(tzinfo=timezone.utc)
            fin_cita = inicio_cita + timedelta(minutes=duraciones[cita_tipo])
            ocupadas.append((inicio_cita, fin_cita))

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