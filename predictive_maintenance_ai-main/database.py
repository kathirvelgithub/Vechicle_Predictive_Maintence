"""
Database Connection Module - PostgreSQL
Supports both SQLAlchemy ORM and direct psycopg2 connections
"""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, pool, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

load_dotenv()

# ============================================
# DATABASE CONFIGURATION
# ============================================

# Option 1: Use full DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/predictive_maintenance")

# Option 2: Build from components (fallback)
if not DATABASE_URL or DATABASE_URL == "":
    POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB = os.getenv("POSTGRES_DB", "predictive_maintenance")
    
    DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

# ============================================
# SQLALCHEMY SETUP (ORM)
# ============================================

# Create engine with connection pooling
engine = create_engine(
    DATABASE_URL,
    poolclass=pool.QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # Verify connections before using
    echo=False  # Set to True for SQL query logging
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for ORM models
Base = declarative_base()


# ============================================
# DEPENDENCY FOR FASTAPI ROUTES
# ============================================

def get_db():
    """
    FastAPI dependency for database sessions.
    Usage:
        @app.get("/items")
        def read_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================
# CONTEXT MANAGER FOR SESSIONS
# ============================================

@contextmanager
def get_db_session():
    """
    Context manager for database sessions.
    Usage:
        with get_db_session() as db:
            result = db.query(Vehicle).all()
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ============================================
# DIRECT PSYCOPG2 CONNECTION (Legacy/Raw SQL)
# ============================================

def get_connection():
    """
    Get a direct psycopg2 connection.
    Useful for raw SQL queries or legacy code.
    
    Usage:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vehicles")
        results = cursor.fetchall()
        cursor.close()
        conn.close()
    """
    return psycopg2.connect(DATABASE_URL)


def execute_query(query: str, params: tuple = None, fetch: bool = True):
    """
    Execute a raw SQL query with automatic connection handling.
    
    Args:
        query: SQL query string
        params: Query parameters (tuple)
        fetch: Whether to fetch results (True) or just execute (False)
    
    Returns:
        List of dicts if fetch=True, None otherwise
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
        
        if fetch:
            results = cursor.fetchall()
            return [dict(row) for row in results]
        else:
            conn.commit()
            return None
            
    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        print(f"❌ Database Error: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def execute_many(query: str, data: list):
    """
    Execute a query with multiple parameter sets (bulk insert/update).
    
    Args:
        query: SQL query with placeholders
        data: List of tuples with parameter values
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.executemany(query, data)
        conn.commit()
    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        print(f"❌ Bulk Operation Error: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============================================
# HEALTH CHECK
# ============================================

def check_database_connection():
    """
    Test database connectivity.
    Returns True if connection successful, False otherwise.
    """
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            return True
    except SQLAlchemyError as e:
        print(f"❌ Database connection failed: {e}")
        return False


# ============================================
# INITIALIZATION
# ============================================

def init_db():
    """
    Initialize database tables (create all tables defined in models).
    Call this once at application startup.
    """
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables initialized")
    except SQLAlchemyError as e:
        print(f"❌ Failed to initialize database: {e}")
        raise


# Test connection on import
if __name__ == "__main__":
    print(f"🔗 Connecting to: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'localhost'}")
    
    if check_database_connection():
        print("✅ Database connection successful!")
    else:
        print("❌ Database connection failed!")


# ============================================
# LEGACY COMPATIBILITY (For existing code)
# ============================================

# For code that uses db.table("tablename").select()...
class SimpleDB:
    """
    Simple wrapper to provide Supabase-like interface for legacy code.
    Note: This is a transitional solution. Migrate to SQLAlchemy for production.
    """
    
    def table(self, table_name: str):
        return SimpleTable(table_name)


class SimpleTable:
    def __init__(self, table_name: str):
        self.table_name = table_name
        self._query = None
        self._operation = "select"
        self._payload = None
        self._where = None
        self._limit = None
        self._order = None
        self._executed_result = None

    def _mark_dirty(self):
        self._executed_result = None
    
    @staticmethod
    def _clean_select_columns(columns: str) -> str:
        """
        Strip Supabase-style join syntax like 'owners(*)' or 'owners(full_name, phone_number)'
        from the SELECT clause, since we use plain PostgreSQL.
        e.g., '*, owners(full_name, phone_number)' -> '*'
        """
        import re
        # Remove patterns like: table_name(...) 
        cleaned = re.sub(r',?\s*\w+\([^)]*\)', '', columns).strip()
        # Remove trailing commas
        cleaned = cleaned.rstrip(',')
        return cleaned if cleaned else "*"
    
    @staticmethod
    def _convert_value(val):
        """
        Convert Python dicts/lists to JSON strings for PostgreSQL JSONB/JSON columns.
        """
        import json as _json
        if isinstance(val, dict):
            return _json.dumps(val, default=str)
        if isinstance(val, list):
            # PostgreSQL arrays: psycopg2 handles Python lists natively for TEXT[]
            # But if the list contains dicts, serialize as JSONB
            if val and isinstance(val[0], dict):
                return _json.dumps(val, default=str)
            return val
        return val

    def select(self, columns: str = "*"):
        clean_cols = self._clean_select_columns(columns)
        self._query = f"SELECT {clean_cols} FROM {self.table_name}"
        self._operation = "select"
        self._payload = None
        self._mark_dirty()
        return self
    
    def insert(self, data: dict):
        self._operation = "insert"
        self._payload = data
        self._mark_dirty()
        return self
    
    def update(self, data: dict):
        self._operation = "update"
        self._payload = data
        self._mark_dirty()
        return self

    def _execute_insert(self):
        filtered = {k: self._convert_value(v) for k, v in (self._payload or {}).items() if v is not None}

        if not filtered:
            return {"data": [], "error": "No insert payload provided"}

        columns = ", ".join(filtered.keys())
        placeholders = ", ".join(["%s"] * len(filtered))
        query = f"INSERT INTO {self.table_name} ({columns}) VALUES ({placeholders}) RETURNING *"

        try:
            result = execute_query(query, tuple(filtered.values()), fetch=True)
        except Exception as e:
            print(f"⚠️ DB Insert Error on {self.table_name}: {e}")
            return {"data": [], "error": str(e)}

        return {"data": result, "error": None}

    def _execute_update(self):
        converted = {k: self._convert_value(v) for k, v in (self._payload or {}).items()}

        if not converted:
            return {"data": [], "error": "No update payload provided"}

        set_clause = ", ".join([f"{k} = %s" for k in converted.keys()])
        query = f"UPDATE {self.table_name} SET {set_clause}"
        if self._where:
            query += f" WHERE {self._where}"
        query += " RETURNING *"

        try:
            result = execute_query(query, tuple(converted.values()), fetch=True)
        except Exception as e:
            print(f"⚠️ DB Update Error on {self.table_name}: {e}")
            return {"data": [], "error": str(e)}

        return {"data": result, "error": None}
    
    def eq(self, column: str, value):
        self._where = f"{column} = '{value}'"
        self._mark_dirty()
        return self
    
    def order(self, column: str, desc: bool = False):
        self._order = f"ORDER BY {column} {'DESC' if desc else 'ASC'}"
        self._mark_dirty()
        return self
    
    def limit(self, count: int):
        self._limit = f"LIMIT {count}"
        self._mark_dirty()
        return self
    
    def execute(self):
        if self._executed_result is not None:
            return self._executed_result

        if self._operation == "insert":
            self._executed_result = self._execute_insert()
            return self._executed_result

        if self._operation == "update":
            self._executed_result = self._execute_update()
            return self._executed_result

        query = self._query or f"SELECT * FROM {self.table_name}"
        if self._where:
            query += f" WHERE {self._where}"
        if self._order:
            query += f" {self._order}"
        if self._limit:
            query += f" {self._limit}"
        
        try:
            result = execute_query(query, fetch=True)
        except Exception as e:
            print(f"⚠️ DB Query Error: {e}")
            self._executed_result = {"data": [], "error": str(e)}
            return self._executed_result

        self._executed_result = {"data": result, "error": None}
        return self._executed_result

    def __getitem__(self, key):
        return self.execute()[key]

    def get(self, key, default=None):
        return self.execute().get(key, default)


# Create compatible instance
db = SimpleDB()

# For backward compatibility
supabase = db  # Old code using 'supabase' will work with 'db'