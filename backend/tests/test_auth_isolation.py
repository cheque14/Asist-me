"""Offline regression tests: real SDK, fake HTTP, no project credentials."""
import importlib.util
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import httpx
from supabase import ClientOptions, create_client


BACKEND = Path(os.environ.get("AUTH_TEST_BACKEND", Path(__file__).resolve().parents[1]))
SERVER_KEY = "offline-server-key"
PROFILE = {
    "id": 1, "nombres": "Test", "apellidos": "User", "username": "test_user",
    "email": "test@example.com", "telefono": "+525512345678", "rol": "paciente", "password_hash": None,
}
AUTH_USER = {
    "id": "00000000-0000-0000-0000-000000000001", "email": PROFILE["email"],
    "aud": "authenticated", "role": "authenticated", "app_metadata": {},
    "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z",
}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AuthIsolationTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.clients = []
        self.profile_exists = True
        self.return_token = True
        self.user_writes = []
        self.patchers = [
            patch("socket.socket.connect", side_effect=AssertionError("Network forbidden")),
            patch("dotenv.load_dotenv", return_value=False),
            patch.dict(os.environ, {
                "SUPABASE_URL": "https://offline.example",
                "SUPABASE_SECRET_KEY": SERVER_KEY,
            }),
            patch("supabase.create_client", side_effect=self.make_client),
        ]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        self.db = load_module("isolated_database", BACKEND / "database.py")
        with patch.dict(sys.modules, {"database": self.db}):
            self.module = load_module("isolated_app", BACKEND / "app.py")
        self.module.app.config["TESTING"] = True
        self.client = self.module.app.test_client()
        self.addCleanup(self.close_clients)

    def close_clients(self):
        for client in self.clients:
            client.close()

    def make_client(self, url, key, options=None):
        options = options or ClientOptions()
        options.auto_refresh_token = False
        client = httpx.Client(transport=httpx.MockTransport(self.respond))
        self.clients.append(client)
        options.httpx_client = client
        return create_client(url, key, options=options)

    def respond(self, request):
        path = request.url.path
        self.calls.append((request.method, path, request.headers.get("authorization")))
        if path in ("/auth/v1/token", "/auth/v1/signup"):
            body = json.loads(request.content)
            if body["password"] != "correct-password":
                return httpx.Response(400, json={
                    "code": "invalid_credentials", "msg": "Invalid login credentials",
                })
            if not self.return_token:
                return httpx.Response(200, json=AUTH_USER)
            return httpx.Response(200, json={
                "access_token": "offline-user-token", "refresh_token": "offline-refresh",
                "token_type": "bearer", "expires_in": 3600, "user": AUTH_USER,
            })
        if path == "/auth/v1/user":
            if request.headers.get("authorization") == "Bearer offline-user-token":
                return httpx.Response(200, json=AUTH_USER)
            return httpx.Response(401, json={"msg": "Invalid token"})
        if path.startswith("/rest/v1/"):
            if request.headers.get("authorization") != "Bearer " + SERVER_KEY:
                return httpx.Response(200, json=[])
            if path.endswith("/usuarios"):
                if request.method == "POST":
                    self.user_writes.append(json.loads(request.content))
                rows = [PROFILE] if self.profile_exists or request.method == "POST" else []
                return httpx.Response(200, json=rows)
            if path.endswith("/pacientes"):
                return httpx.Response(200, json=[{"id": 10}])
        raise AssertionError(f"Unexpected request: {request.method} {path}")

    def login(self, identifier="test@example.com", password="correct-password"):
        return self.client.post("/api/auth/login", json={
            "identificador": identifier, "password": password,
        })

    def assert_server_authorization(self):
        self.assertEqual(self.db.supabase.options.headers["Authorization"], "Bearer " + SERVER_KEY)
        for _, path, authorization in self.calls:
            if path.startswith("/rest/v1/"):
                self.assertEqual(authorization, "Bearer " + SERVER_KEY)

    def test_repeated_login_keeps_server_permissions(self):
        responses = [self.login(identifier) for identifier in ("test@example.com", "test_user")]
        self.assertEqual([response.status_code for response in responses], [200, 200])
        for response in responses:
            self.assertEqual(response.status_code, 200, response.json)
            self.assertEqual(response.json["access_token"], "offline-user-token")
            self.assertEqual(response.json["usuario"]["perfil_id"], 10)
            self.assertEqual(response.json["usuario"]["telefono"], PROFILE["telefono"])
        self.assert_server_authorization()
        self.assertTrue(all(method == "GET" or path == "/auth/v1/token"
                            for method, path, _ in self.calls))

    def test_registration_with_session_keeps_profile_writes_privileged(self):
        self.profile_exists = False
        response = self.client.post("/api/auth/register", json={
            "nombres": "Test", "apellidos": "User", "username": "test_user",
            "email": "test@example.com", "password": "correct-password", "rol": "paciente",
            "telefono": "+525512345678",
        })
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["usuario"]["perfil_id"], 10)
        self.assertEqual(response.json["usuario"]["telefono"], "+525512345678")
        self.assertEqual(self.user_writes[0]["telefono"], "+525512345678")
        self.assertFalse(response.json["requiere_confirmacion"])
        self.assert_server_authorization()

    def test_patient_registration_requires_a_valid_phone(self):
        response = self.client.post("/api/auth/register", json={
            "nombres": "Test", "apellidos": "User", "username": "test_user",
            "email": "test@example.com", "password": "correct-password", "rol": "paciente",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("teléfono", response.json["error"])
        self.assertFalse(self.user_writes)

    def test_wrong_password_still_returns_401_without_writes(self):
        response = self.login(password="incorrect-password")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json, {"error": "Usuario/correo o contraseña incorrectos"})
        self.assert_server_authorization()
        self.assertTrue(all(method == "GET" or path == "/auth/v1/token"
                            for method, path, _ in self.calls))

    def test_missing_profile_still_denied(self):
        self.profile_exists = False
        response = self.login()
        self.assertEqual(response.status_code, 401)
        self.assertFalse(any(path.startswith("/auth/") for _, path, _ in self.calls))

    def test_missing_session_still_denied(self):
        self.return_token = False
        response = self.login()
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("access_token", response.json)

    def test_session_lookup_uses_explicit_token(self):
        response = self.client.get("/api/auth/me", headers={"Authorization": "Bearer offline-user-token"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["usuario"]["id"], PROFILE["id"])
        self.assert_server_authorization()
        response = self.client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"})
        self.assertEqual(response.status_code, 401)

    def test_profile_update_requests_email_confirmation_without_changing_current_email(self):
        profile = {**PROFILE, "nombre": "Test User", "nombres": "Test", "apellidos": "User",
                   "correo_pendiente": None, "perfil_id": 10}
        query = Mock()
        query.select.return_value = query
        query.eq.return_value = query
        query.update.return_value = query
        query.execute.return_value = SimpleNamespace(data=[])
        with patch.object(self.module, "autenticar_peticion", return_value=(profile.copy(), None)), \
                patch.object(self.module, "supabase", SimpleNamespace(table=lambda _name: query)), \
                patch.object(self.module, "request_auth_email_change") as request_email:
            response = self.client.put("/api/auth/profile", headers={
                "Authorization": "Bearer offline-user-token",
            }, json={"nombres": "Ana", "apellidos": "Pérez", "email": "ana@example.com",
                    "telefono": "+52 55 1234 5678"})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json["usuario"]["email"], PROFILE["email"])
        self.assertEqual(response.json["usuario"]["correo_pendiente"], "ana@example.com")
        self.assertEqual(response.json["usuario"]["telefono"], "+525512345678")
        request_email.assert_called_once_with("offline-user-token", "ana@example.com")

    def test_profile_update_rejects_invalid_email_before_writing(self):
        profile = {**PROFILE, "nombres": "Test", "apellidos": "User", "perfil_id": 10}
        with patch.object(self.module, "autenticar_peticion", return_value=(profile, None)), \
                patch.object(self.module, "supabase") as database:
            response = self.client.put("/api/auth/profile", headers={
                "Authorization": "Bearer offline-user-token",
            }, json={"nombres": "Test", "apellidos": "User", "email": "not-an-email", "telefono": ""})
        self.assertEqual(response.status_code, 400)
        database.table.assert_not_called()

    def test_email_migration_syncs_only_after_auth_email_changes(self):
        migration = (BACKEND / "migrations" / "009_perfil_edicion_correo.sql").read_text(encoding="utf-8")
        self.assertIn("ADD COLUMN IF NOT EXISTS correo_pendiente", migration)
        self.assertIn("AFTER UPDATE OF email ON auth.users", migration)
        self.assertIn("SET email = NEW.email", migration)
        self.assertIn("AND lower(correo_pendiente) = lower(NEW.email)", migration)

    def test_auth_logs_do_not_expose_bearer_tokens(self):
        token = "sensitive-offline-token"
        with patch("builtins.print") as log:
            self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertNotIn(token, " ".join(str(call.args) for call in log.call_args_list))

    def test_rejected_email_request_does_not_save_other_profile_fields(self):
        profile = {**PROFILE, "nombres": "Test", "apellidos": "User", "correo_pendiente": None}
        updates = []
        query = Mock()
        query.select.return_value = query
        query.eq.return_value = query
        query.update.side_effect = lambda values: (updates.append(values) or query)
        query.execute.return_value = SimpleNamespace(data=[])
        rejection = self.module.AuthEmailChangeError(409, "Email already registered")
        with patch.object(self.module, "autenticar_peticion", return_value=(profile, None)), \
                patch.object(self.module, "supabase", SimpleNamespace(table=lambda _name: query)), \
                patch.object(self.module, "request_auth_email_change", side_effect=rejection):
            response = self.client.put("/api/auth/profile", headers={
                "Authorization": "Bearer offline-user-token",
            }, json={"nombres": "Changed", "apellidos": "Name", "email": "new@example.com", "telefono": "+525512345678"})
        self.assertEqual(response.status_code, 409)
        self.assertNotIn({"nombres": "Changed", "apellidos": "Name", "telefono": "+525512345678"}, updates)
        self.assertIsNone(profile.get("correo_pendiente"))

    def test_uncertain_email_request_preserves_pending_marker_without_other_writes(self):
        profile = {**PROFILE, "nombres": "Test", "apellidos": "User", "correo_pendiente": None}
        updates = []
        query = Mock()
        query.select.return_value = query
        query.eq.return_value = query
        query.update.side_effect = lambda values: (updates.append(values) or query)
        query.execute.return_value = SimpleNamespace(data=[])
        with patch.object(self.module, "autenticar_peticion", return_value=(profile, None)), \
                patch.object(self.module, "supabase", SimpleNamespace(table=lambda _name: query)), \
                patch.object(self.module, "request_auth_email_change", side_effect=TimeoutError("timeout")):
            response = self.client.put("/api/auth/profile", headers={
                "Authorization": "Bearer offline-user-token",
            }, json={"nombres": "Changed", "apellidos": "Name", "email": "new@example.com", "telefono": "+525512345678"})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(updates, [{"correo_pendiente": "new@example.com"}])

    def test_notification_unread_count_is_scoped_to_authenticated_user(self):
        query = Mock()
        query.select.return_value = query
        query.eq.return_value = query
        query.execute.return_value = SimpleNamespace(data=[{"id": 1}, {"id": 2}])
        with patch.object(self.module, "autenticar_peticion", return_value=(PROFILE, None)), \
                patch.object(self.module, "supabase", SimpleNamespace(table=lambda _name: query)):
            response = self.client.get("/api/notificaciones/no-leidas/count")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"count": 2})
        query.eq.assert_any_call("usuario_id", PROFILE["id"])
        query.eq.assert_any_call("leida", False)

    def test_mark_notification_read_scopes_update_to_authenticated_user(self):
        query = Mock()
        query.update.return_value = query
        query.eq.return_value = query
        query.execute.return_value = SimpleNamespace(data=[])
        with patch.object(self.module, "autenticar_peticion", return_value=(PROFILE, None)), \
                patch.object(self.module, "supabase", SimpleNamespace(table=lambda _name: query)):
            response = self.client.put("/api/notificaciones/42/leer")
        self.assertEqual(response.status_code, 200)
        query.update.assert_called_once_with({"leida": True})
        query.eq.assert_any_call("id", 42)
        query.eq.assert_any_call("usuario_id", PROFILE["id"])

    def test_mark_notification_read_requires_authentication(self):
        response = self.client.put("/api/notificaciones/42/leer")
        self.assertEqual(response.status_code, 401)

    def test_auth_operations_use_independent_nonpersistent_clients(self):
        clients = []
        original = self.db.create_client

        def capture(*args, **kwargs):
            client = original(*args, **kwargs)
            clients.append(client)
            return client

        with patch.object(self.db, "create_client", side_effect=capture):
            for _ in range(2):
                response = self.login()
                self.assertEqual(response.status_code, 200)
        self.assertEqual(len(clients), 2)
        self.assertIsNot(clients[0], clients[1])
        for client in clients:
            self.assertFalse(client.options.persist_session)
            self.assertFalse(client.options.auto_refresh_token)
        self.assert_server_authorization()


if __name__ == "__main__":
    unittest.main()
