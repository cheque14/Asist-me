# backend/database.py
import os
from contextlib import contextmanager
from pathlib import Path
import httpx
from dotenv import load_dotenv
from supabase import create_client, Client, ClientOptions

load_dotenv(dotenv_path=Path(__file__).with_name(".env"), override=True)

url: str = os.environ.get("SUPABASE_URL")
# The backend needs the secret/service-role key to read protected tables.
key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_KEY")

if not url or not key:
    raise ValueError("Faltan las variables SUPABASE_URL o SUPABASE_KEY en el archivo .env")

supabase: Client = create_client(url, key)


class AuthEmailChangeError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


@contextmanager
def auth_client():
    """Keep user sessions away from the shared server-authorized client."""
    with httpx.Client() as http_client:
        client = create_client(url, key, options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
            httpx_client=http_client,
        ))
        yield client.auth


def sign_in_with_password(credentials):
    with auth_client() as auth:
        return auth.sign_in_with_password(credentials)


def sign_up(credentials):
    with auth_client() as auth:
        return auth.sign_up(credentials)


def request_auth_email_change(access_token, email):
    """Request a confirmation-gated email change for the authenticated user."""
    with httpx.Client(timeout=15) as client:
        response = client.put(
            f"{url.rstrip('/')}/auth/v1/user",
            headers={"apikey": key, "Authorization": f"Bearer {access_token}"},
            json={"email": email},
        )
    if response.is_error:
        try:
            detail = response.json().get("msg") or response.json().get("message")
        except ValueError:
            detail = None
        raise AuthEmailChangeError(response.status_code, detail or "No se pudo solicitar el cambio de correo")
    return response.json()
