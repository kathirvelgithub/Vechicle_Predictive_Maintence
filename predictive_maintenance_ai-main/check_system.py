"""
System Health Check Script
Verifies all components are properly configured and running
"""
import os
import sys
from pathlib import Path

# Colors for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_header(text):
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}{text.center(60)}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")

def check_item(name, condition, details=""):
    if condition:
        print(f"{GREEN}✅ {name}{RESET}")
        if details:
            print(f"   {details}")
        return True
    else:
        print(f"{RED}❌ {name}{RESET}")
        if details:
            print(f"   {details}")
        return False

def check_warning(name, details):
    print(f"{YELLOW}⚠️  {name}{RESET}")
    print(f"   {details}")

# ============================================
# 1. Environment Variables
# ============================================
print_header("Environment Configuration")

env_file = Path(".env")
env_exists = env_file.exists()
check_item("Environment file (.env)", env_exists, 
           "Found" if env_exists else "Create from .env.example")

if env_exists:
    from dotenv import load_dotenv
    load_dotenv()
    
    database_url = os.getenv("DATABASE_URL")
    check_item("DATABASE_URL configured", bool(database_url), database_url or "Not set")
    
    groq_key = os.getenv("GROQ_API_KEY")
    check_item("GROQ_API_KEY configured", bool(groq_key), 
               "Set" if groq_key else "Not set - AI features won't work")
    
    cors_origins = os.getenv("CORS_ORIGINS")
    check_item("CORS_ORIGINS configured", bool(cors_origins), cors_origins or "Not set")
else:
    print(f"{YELLOW}   Copy .env.example to .env and configure it{RESET}")

# ============================================
# 2. Python Environment
# ============================================
print_header("Python Environment")

python_version = sys.version_info
version_ok = python_version.major == 3 and python_version.minor >= 11
check_item("Python version 3.11+", version_ok, 
           f"Current: {python_version.major}.{python_version.minor}.{python_version.micro}")

# Check if in virtual environment
in_venv = hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix)
check_item("Virtual environment active", in_venv,
           "Active" if in_venv else "Run: .\\venv\\Scripts\\activate")

# ============================================
# 3. Python Dependencies
# ============================================
print_header("Python Dependencies")

required_packages = [
    ("fastapi", "FastAPI"),
    ("uvicorn", "Uvicorn"),
    ("sqlalchemy", "SQLAlchemy"),
    ("psycopg2", "psycopg2"),
    ("langchain", "LangChain"),
    ("langgraph", "LangGraph"),
]

missing_packages = []
for module_name, display_name in required_packages:
    try:
        __import__(module_name)
        check_item(display_name, True, "Installed")
    except ImportError:
        check_item(display_name, False, "Missing - run: pip install -r requirements.txt")
        missing_packages.append(module_name)

# ============================================
# 4. Database Connection
# ============================================
print_header("Database Connection")

try:
    from database import check_database_connection, DATABASE_URL
    
    # Hide password in URL for display
    safe_url = DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL
    print(f"   Connecting to: {safe_url}")
    
    db_connected = check_database_connection()
    check_item("PostgreSQL connection", db_connected,
               "Connected" if db_connected else "Failed - check PostgreSQL is running")
    
    if db_connected:
        from database import execute_query
        
        # Check if tables exist
        try:
            result = execute_query("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """, fetch=True)
            
            table_count = len(result)
            check_item(f"Database tables ({table_count} found)", table_count >= 6,
                       f"Tables: {', '.join([r['table_name'] for r in result[:5]])}")
            
            if table_count < 6:
                check_warning("Database not initialized",
                            "Run: psql -U postgres -d predictive_maintenance -f database/init.sql")
            
            # Check sample data
            vehicles = execute_query("SELECT COUNT(*) as count FROM vehicles", fetch=True)
            vehicle_count = vehicles[0]['count'] if vehicles else 0
            check_item(f"Sample vehicles ({vehicle_count} found)", vehicle_count > 0,
                       "Sample data loaded" if vehicle_count > 0 else "No data yet")
            
        except Exception as e:
            check_item("Database schema", False, f"Error: {str(e)}")
            check_warning("Initialize database",
                        "Run: psql -U postgres -d predictive_maintenance -f database/init.sql")
    
except ImportError as e:
    check_item("Database module", False, f"Import error: {str(e)}")
    if not in_venv:
        print(f"{YELLOW}   Activate venv first: .\\venv\\Scripts\\activate{RESET}")
    else:
        print(f"{YELLOW}   Install dependencies: pip install -r requirements.txt{RESET}")

# ============================================
# 5. File Structure
# ============================================
print_header("File Structure")

required_files = [
    ("app/main.py", "FastAPI application"),
    ("app/agents/master.py", "AI agent orchestrator"),
    ("database/init.sql", "Database schema"),
    ("requirements.txt", "Python dependencies"),
    ("docker-compose.yml", "Docker configuration"),
]

for file_path, description in required_files:
    exists = Path(file_path).exists()
    check_item(f"{description}", exists, file_path)

# ============================================
# 6. Docker (Optional)
# ============================================
print_header("Docker (Optional)")

import subprocess

try:
    result = subprocess.run(["docker", "--version"], capture_output=True, text=True, timeout=5)
    docker_installed = result.returncode == 0
    check_item("Docker installed", docker_installed, 
               result.stdout.strip() if docker_installed else "Not installed")
    
    if docker_installed:
        result = subprocess.run(["docker", "ps"], capture_output=True, text=True, timeout=5)
        docker_running = result.returncode == 0
        check_item("Docker running", docker_running,
                   "Running" if docker_running else "Start Docker Desktop")
        
        if docker_running:
            # Check if our containers are running
            result = subprocess.run(["docker", "ps", "--filter", "name=predictive_maintenance_db"],
                                   capture_output=True, text=True, timeout=5)
            db_container = "predictive_maintenance_db" in result.stdout
            check_item("PostgreSQL container", db_container,
                       "Running" if db_container else "Start with: docker-compose up -d")
except FileNotFoundError:
    check_warning("Docker not found", 
                 "Install Docker Desktop or use manual PostgreSQL installation")
except subprocess.TimeoutExpired:
    check_warning("Docker check timeout", "Docker may be slow to respond")

# ============================================
# 7. Simulator Files
# ============================================
print_header("Vehicle Simulator")

simulator_path = Path("../Simulation")
if simulator_path.exists():
    check_item("Simulator directory", True, str(simulator_path.resolve()))
    
    required_sim_files = [
        ("package.json", "Node.js configuration"),
        ("server.js", "WebSocket server"),
        ("app/page.tsx", "Dashboard UI"),
        ("lib/realistic-simulator.ts", "Physics engine"),
    ]
    
    for file_path, description in required_sim_files:
        full_path = simulator_path / file_path
        exists = full_path.exists()
        check_item(f"{description}", exists, file_path)
    
    # Check if node_modules exists
    node_modules = simulator_path / "node_modules"
    deps_installed = node_modules.exists()
    check_item("Node.js dependencies", deps_installed,
               "Installed" if deps_installed else "Run: npm install")
else:
    check_item("Simulator directory", False, "Not found")

# ============================================
# Summary
# ============================================
print_header("Summary")

print(f"\n{BLUE}Quick Start Commands:{RESET}")
print(f"""
1. Start PostgreSQL:
   {GREEN}docker-compose up -d{RESET}

2. Activate Python environment:
   {GREEN}.\\venv\\Scripts\\activate{RESET}

3. Start FastAPI backend:
   {GREEN}python -m app.main{RESET}

4. Start simulator (in another terminal):
   {GREEN}cd ../Simulation
   npm run dev{RESET}

5. Test the system:
   {GREEN}python fleet_simulator.py{RESET}
""")

print(f"{BLUE}Access Points:{RESET}")
print(f"  • Backend API:    {GREEN}http://localhost:8000{RESET}")
print(f"  • API Docs:       {GREEN}http://localhost:8000/docs{RESET}")
print(f"  • Simulator:      {GREEN}http://localhost:3000{RESET}")
print(f"  • pgAdmin:        {GREEN}http://localhost:5050{RESET}")

print(f"\n{BLUE}Documentation:{RESET}")
print(f"  • Setup Guide:     {GREEN}SETUP_GUIDE.md{RESET}")
print(f"  • Migration Info:  {GREEN}MIGRATION_SUMMARY.md{RESET}")

print(f"\n{BLUE}For detailed setup instructions, see: {GREEN}SETUP_GUIDE.md{RESET}\n")
