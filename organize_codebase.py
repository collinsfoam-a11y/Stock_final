#!/usr/bin/env python3
"""
Script to organize and clean up the codebase structure.
This addresses app file wiring, missing configurations, and overall organization.
"""

import os
import shutil
from pathlib import Path


def fix_backend_structure():
    """Fix backend structure and configuration issues."""
    backend_path = Path("Stock_final/backend")
    
    # Create missing directories if needed
    required_dirs = [
        backend_path / "logs",
        backend_path / "temp",
        backend_path / "uploads"
    ]
    
    for dir_path in required_dirs:
        if not dir_path.exists():
            dir_path.mkdir(parents=True, exist_ok=True)
            print(f"Created directory: {dir_path}")


def fix_frontend_structure():
    """Fix frontend structure and configuration issues."""
    frontend_path = Path("Stock_final/frontend")
    
    # Ensure necessary directories exist
    required_dirs = [
        frontend_path / "public",
        frontend_path / "assets",
        frontend_path / "components"
    ]
    
    for dir_path in required_dirs:
        if not dir_path.exists():
            dir_path.mkdir(parents=True, exist_ok=True)
            print(f"Created directory: {dir_path}")


def create_missing_configs():
    """Create missing configuration files."""
    # Create backend .env file if missing
    backend_env_path = Path("Stock_final/backend/.env")
    if not backend_env_path.exists():
        backend_env_content = """# Backend Environment Variables
DEBUG=False
ENVIRONMENT=production
DATABASE_URL=mongodb://localhost:27017
SQL_SERVER_CONNECTION_STRING=
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key
JWT_REFRESH_SECRET_KEY=your-jwt-refresh-secret-key
REDIS_URL=redis://localhost:6379
"""
        with open(backend_env_path, 'w') as f:
            f.write(backend_env_content)
        print(f"Created backend .env file: {backend_env_path}")
    
    # Create frontend .env file if missing
    frontend_env_path = Path("Stock_final/frontend/.env")
    if not frontend_env_path.exists():
        frontend_env_content = """# Frontend Environment Variables
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
EXPO_PUBLIC_SENTRY_DSN=
NODE_ENV=development
"""
        with open(frontend_env_path, 'w') as f:
            f.write(frontend_env_content)
        print(f"Created frontend .env file: {frontend_env_path}")


def validate_app_wiring():
    """Validate that app files are properly wired."""
    print("Validating app structure...")
    
    # Check backend app structure
    backend_app_path = Path("Stock_final/backend/app")
    backend_required_files = [
        "factory.py",
        "routers.py", 
        "root_router.py",
        "settings_runtime.py",
        "static.py",
        "middleware.py",
        "observability.py"
    ]
    
    for file_name in backend_required_files:
        file_path = backend_app_path / file_name
        if not file_path.exists():
            print(f"Warning: Missing backend app file: {file_path}")
        else:
            print(f"✓ Backend app file exists: {file_name}")
    
    # Check frontend app structure
    frontend_app_path = Path("Stock_final/frontend/app")
    frontend_required_files = [
        "_layout.tsx",
        "index.tsx",
        "+not-found.tsx"
    ]
    
    for file_name in frontend_required_files:
        file_path = frontend_app_path / file_name
        if not file_path.exists():
            print(f"Warning: Missing frontend app file: {file_path}")
        else:
            print(f"✓ Frontend app file exists: {file_name}")


def remove_unwanted_files():
    """Remove any remaining unwanted files."""
    root_path = Path("Stock_final")
    
    # Remove any remaining temporary files
    temp_patterns = [
        "*.tmp",
        "*.temp", 
        "*~",
        ".DS_Store",
        "Thumbs.db"
    ]
    
    for pattern in temp_patterns:
        for temp_file in root_path.rglob(pattern):
            if temp_file.is_file():
                try:
                    temp_file.unlink()
                    print(f"Removed temporary file: {temp_file}")
                except:
                    pass


def create_documentation_files():
    """Create missing documentation files."""
    docs_path = Path("Stock_final/docs")
    
    # Create README for docs if missing
    docs_readme_path = docs_path / "README.md"
    if not docs_readme_path.exists():
        docs_readme_content = """# Documentation

This directory contains all project documentation.

## Structure
- `api/` - API documentation
- `architecture/` - Architecture documents
- `development/` - Development guides
- `deployment/` - Deployment guides
"""
        with open(docs_readme_path, 'w') as f:
            f.write(docs_readme_content)
        print(f"Created docs README: {docs_readme_path}")


def fix_requirements():
    """Ensure requirements files are properly configured."""
    backend_req_path = Path("Stock_final/backend/requirements.txt")
    
    # Verify the requirements file structure
    if backend_req_path.exists():
        with open(backend_req_path, 'r') as f:
            content = f.read()
        
        # Ensure it includes the production requirements
        if "-r requirements.production.txt" not in content:
            with open(backend_req_path, 'w') as f:
                f.write("# Backward-compatible alias for local development and test installs.\n")
                f.write("# Prefer `requirements.dev.txt` for explicit non-production environments.\n")
                f.write("-r requirements.production.txt\n")
            print("Fixed backend requirements.txt file")


def organize_scripts():
    """Organize script files."""
    scripts_path = Path("Stock_final/scripts")
    
    # Create subdirectories for different types of scripts
    script_dirs = [
        scripts_path / "setup",
        scripts_path / "maintenance", 
        scripts_path / "utilities",
        scripts_path / "deployment"
    ]
    
    for dir_path in script_dirs:
        if not dir_path.exists():
            dir_path.mkdir(parents=True, exist_ok=True)
            print(f"Created script directory: {dir_path}")


def main():
    """Main function to execute organization operations."""
    print("Starting comprehensive codebase organization...")
    
    # Fix backend structure
    fix_backend_structure()
    
    # Fix frontend structure
    fix_frontend_structure()
    
    # Create missing configuration files
    create_missing_configs()
    
    # Validate app wiring
    validate_app_wiring()
    
    # Organize scripts
    organize_scripts()
    
    # Create documentation files
    create_documentation_files()
    
    # Fix requirements
    fix_requirements()
    
    # Remove unwanted files
    remove_unwanted_files()
    
    print("\nCodebase organization completed successfully!")
    print("\nSummary of actions:")
    print("- Fixed backend directory structure")
    print("- Fixed frontend directory structure") 
    print("- Created missing configuration files")
    print("- Validated app file structure")
    print("- Organized script directories")
    print("- Created documentation structure")
    print("- Fixed requirements configuration")
    print("- Removed temporary files")


if __name__ == "__main__":
    main()