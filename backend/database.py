# backend/database.py
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
# Se usa SUPABASE_KEY que ahora contiene la clave secreta/service_role
key: str = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")

if not url or not key:
    raise ValueError("Faltan las variables SUPABASE_URL o SUPABASE_KEY en el archivo .env")

supabase: Client = create_client(url, key)