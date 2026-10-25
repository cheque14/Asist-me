"""Isolated clinical routes. Dependencies are supplied by the application host."""
from datetime import date
from functools import wraps
import json
import re

from flask import Blueprint, jsonify, request


ACTIVE_STATES = ("confirmada", "reprogramada", "completada")
TEXT_LIMITS = {"antecedentes": 8000, "alergias": 4000, "motivo": 2000,
               "exploracion": 8000, "diagnostico": 4000, "tratamiento": 8000,
               "seguimiento": 4000}
VITAL_KEYS = frozenset(("peso_kg", "talla_cm", "temperatura_c", "frecuencia_cardiaca",
                        "presion_arterial", "saturacion_oxigeno"))
MAX_ID = 9223372036854775807
MAX_BODY = 48000
MIGRATION_CODES = frozenset(("42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"))


class ClinicalValidationError(ValueError):
    """Only intentionally public validation messages may reach the response."""


def _positive_id(value):
    if type(value) is not int or not 1 <= value <= MAX_ID:
        raise ClinicalValidationError("El identificador debe ser un entero positivo válido.")
    return value


def _path_id(value):
    if not re.fullmatch(r"[0-9]{1,19}", value):
        raise ClinicalValidationError("El identificador debe ser un entero positivo válido.")
    return _positive_id(int(value))


def _body():
    # Bound parsing locally without changing the host application's global limits.
    if request.content_length is not None and request.content_length > MAX_BODY:
        return None
    raw = request.stream.read(MAX_BODY + 1)
    if len(raw) > MAX_BODY:
        return None
    try:
        body = json.loads(raw) if request.is_json else None
    except (ValueError, UnicodeError):
        raise ClinicalValidationError("Envía un objeto JSON válido.") from None
    if not isinstance(body, dict):
        raise ClinicalValidationError("Envía un objeto JSON válido.")
    return body


def _note(body):
    if set(body) - (set(TEXT_LIMITS) | {"signos_vitales", "cita_id"}):
        raise ClinicalValidationError("La nota contiene campos no permitidos.")
    result = {}
    for key, limit in TEXT_LIMITS.items():
        if key in body:
            value = body[key]
            if not isinstance(value, str) or len(value) > limit or "\x00" in value:
                raise ClinicalValidationError("Los campos clínicos deben ser textos dentro del límite permitido.")
            result[key] = value.strip()
    if not any(result.values()):
        raise ClinicalValidationError("La nota debe incluir al menos un campo clínico con contenido.")
    if "cita_id" in body:
        result["cita_id"] = _positive_id(body["cita_id"])
    if "signos_vitales" in body:
        signs = body["signos_vitales"]
        if not isinstance(signs, dict) or set(signs) - VITAL_KEYS:
            raise ClinicalValidationError("Los signos vitales deben usar los campos permitidos.")
        clean = {}
        for key, value in signs.items():
            if not isinstance(value, str) or len(value) > 32:
                raise ClinicalValidationError("Cada signo vital debe ser un texto de hasta 32 caracteres.")
            value = value.strip()
            if value:
                pattern = r"[0-9]{1,3}/[0-9]{1,3}" if key == "presion_arterial" else r"[0-9]{1,4}(?:\.[0-9]{1,3})?"
                if not re.fullmatch(pattern, value) or any(float(v) <= 0 for v in value.split("/")):
                    raise ClinicalValidationError("Usa valores positivos sin unidades; presión en formato 120/80.")
            clean[key] = value
        result["signos_vitales"] = clean
    return result


def _database_error(error):
    code = str(getattr(error, "code", ""))
    if code in MIGRATION_CODES:
        return jsonify(error="Expediente no disponible. Aplica la migración 012_clinical_records.sql y actualiza la caché del esquema."), 503
    if code == "42501":
        return jsonify(error="No tienes acceso clínico a esta persona."), 403
    if code == "P0002":
        return jsonify(error="Persona no encontrada."), 404
    if code in ("22023", "22007", "22008", "23514", "22P02"):
        return jsonify(error="Los datos del expediente no son válidos."), 400
    if code in ("23503", "23505"):
        return jsonify(error="No se pudo guardar por un conflicto de datos."), 409
    return jsonify(error="El servicio de expedientes no está disponible. Intenta nuevamente."), 503


def register_clinical_routes(app, get_database, authenticate):
    """Register once; authenticate returns (trusted application user, error response)."""
    routes = Blueprint("clinical_records", __name__, url_prefix="/api/expedientes")

    def guarded(handler):
        @wraps(handler)
        def wrapped(*args, **kwargs):
            actor, error = authenticate()
            if error is not None:
                return error
            try:
                if not actor or actor.get("rol") not in ("paciente", "medico"):
                    return jsonify(error="No tienes acceso a expedientes clínicos."), 403
                try:
                    _positive_id(actor.get("id"))
                    _positive_id(actor.get("perfil_id"))
                except ClinicalValidationError:
                    return jsonify(error="El perfil de la sesión no es válido."), 403
                return handler(get_database(), actor, *args, **kwargs)
            except ClinicalValidationError as exc:
                return jsonify(error=str(exc)), 400
            except Exception as exc:
                return _database_error(exc)
        return wrapped

    def access(db, actor, person_id, write=False, cita_id=None):
        if write and actor["rol"] != "medico":
            return jsonify(error="Solo el médico tratante puede registrar datos clínicos."), 403
        rows = db.table("personas_atendidas").select(
            "id,paciente_id,tipo,nombre,telefono,fecha_nacimiento"
        ).eq("id", person_id).limit(1).execute().data
        if not rows:
            return jsonify(error="Persona no encontrada."), 404
        person = rows[0]
        if actor["rol"] == "paciente":
            permitted = person["paciente_id"] == actor["perfil_id"] and person["tipo"] == "titular"
        else:
            query = db.table("citas").select("id").eq("persona_atendida_id", person_id).eq(
                "medico_id", actor["perfil_id"]
            ).eq("paciente_id", person["paciente_id"]).in_("estado", list(ACTIVE_STATES))
            if cita_id is not None:
                query = query.eq("id", cita_id)
            permitted = bool(query.limit(1).execute().data)
        if not permitted:
            if cita_id is not None:
                return jsonify(error="La cita no corresponde a esta persona y médico tratante."), 400
            return jsonify(error="No tienes acceso clínico a esta persona."), 403
        return None

    def rpc(db, name, actor, **params):
        # Only the trusted authentication result supplies the actor, never request data.
        return db.rpc(name, {"p_usuario_id": actor["id"], **params}).execute().data

    @routes.get("/personas")
    @guarded
    def personas(db, actor):
        if request.args:
            raise ClinicalValidationError("Esta consulta no acepta filtros de otras cuentas.")
        return jsonify(rpc(db, "clinical_personas", actor))

    @routes.get("/<person_id>")
    @guarded
    def expediente(db, actor, person_id):
        person_id = _path_id(person_id)
        if set(request.args) - {"limit", "offset"} or any(len(request.args.getlist(k)) != 1 for k in request.args):
            raise ClinicalValidationError("La paginación no es válida.")
        values = [request.args.get("limit", "50"), request.args.get("offset", "0")]
        if any(not re.fullmatch(r"[0-9]{1,7}", v) for v in values):
            raise ClinicalValidationError("La paginación no es válida.")
        limit, offset = map(int, values)
        if not 1 <= limit <= 100 or not 0 <= offset <= 1000000:
            raise ClinicalValidationError("Usa limit de 1 a 100 y offset de 0 a 1000000.")
        denied = access(db, actor, person_id)
        if denied is not None:
            return denied
        return jsonify(rpc(db, "clinical_expediente", actor, p_persona_id=person_id,
                           p_limit=limit, p_offset=offset))

    @routes.post("/<person_id>/notas")
    @guarded
    def agregar_nota(db, actor, person_id):
        person_id = _path_id(person_id)
        denied = access(db, actor, person_id, write=True)
        if denied is not None:
            return denied
        body = _body()
        if body is None:
            return jsonify(error="El contenido excede el tamaño permitido."), 413
        data = _note(body)
        if "cita_id" in data:
            denied = access(db, actor, person_id, write=True, cita_id=data["cita_id"])
            if denied is not None:
                return denied
        return jsonify(rpc(db, "clinical_agregar_nota", actor, p_persona_id=person_id, p_datos=data)), 201

    @routes.patch("/<person_id>/persona")
    @guarded
    def actualizar_persona(db, actor, person_id):
        person_id = _path_id(person_id)
        denied = access(db, actor, person_id, write=True)
        if denied is not None:
            return denied
        body = _body()
        if body is None:
            return jsonify(error="El contenido excede el tamaño permitido."), 413
        if set(body) != {"fecha_nacimiento"}:
            raise ClinicalValidationError("Solo se permite actualizar fecha_nacimiento.")
        value = body["fecha_nacimiento"]
        if value is not None:
            if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
                raise ClinicalValidationError("La fecha de nacimiento debe usar el formato AAAA-MM-DD.")
            try:
                parsed = date.fromisoformat(value)
            except ValueError:
                raise ClinicalValidationError("La fecha de nacimiento no es válida.") from None
            if not date(1900, 1, 1) <= parsed <= date.today():
                raise ClinicalValidationError("La fecha de nacimiento debe estar entre 1900 y hoy.")
        return jsonify(rpc(db, "clinical_actualizar_persona", actor,
                           p_persona_id=person_id, p_fecha_nacimiento=value))

    app.register_blueprint(routes)
