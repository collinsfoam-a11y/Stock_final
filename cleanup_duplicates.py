#!/usr/bin/env python3
"""
Script to clean up duplicate and nested folders in the codebase.
This addresses the issues found during the duplication analysis.
"""

import os
import shutil
from pathlib import Path


def remove_nested_agent_directories(root_dir):
    """Remove nested agent directories that are duplicates."""
    root_path = Path(root_dir)
    
    # Remove .agent directory in root if it's redundant
    agent_dirs = [
        root_path / ".agent",
        root_path / ".agents", 
        root_path / "backend" / ".agent"
    ]
    
    for agent_dir in agent_dirs:
        if agent_dir.exists():
            print(f"Removing nested agent directory: {agent_dir}")
            shutil.rmtree(agent_dir)


def remove_backup_files(root_dir):
    """Remove backup files with .bak extensions."""
    root_path = Path(root_dir)
    
    # Find and remove all .bak files
    for bak_file in root_path.rglob("*.bak"):
        print(f"Removing backup file: {bak_file}")
        bak_file.unlink()


def remove_legacy_directories(root_dir):
    """Remove legacy directories with old files."""
    root_path = Path(root_dir)
    
    # Remove legacy directories
    legacy_dirs = [
        root_path / "scripts" / "legacy",
        root_path / "backups"
    ]
    
    for legacy_dir in legacy_dirs:
        if legacy_dir.exists():
            print(f"Removing legacy directory: {legacy_dir}")
            shutil.rmtree(legacy_dir)


def remove_archive_files(root_dir):
    """Remove archive files that may contain duplicate content."""
    root_path = Path(root_dir)
    
    # Remove archive files
    archive_files = [
        root_path / "backend" / "api.zip",
        root_path / "frontend" / "dist"
    ]
    
    for archive_file in archive_files:
        if archive_file.exists():
            if archive_file.is_file():
                print(f"Removing archive file: {archive_file}")
                archive_file.unlink()
            elif archive_file.is_dir():
                print(f"Removing distribution directory: {archive_file}")
                shutil.rmtree(archive_file)


def remove_cache_directories(root_dir):
    """Remove cache directories that clutter the project."""
    root_path = Path(root_dir)
    
    # Find and remove all __pycache__ directories
    for pycache_dir in root_path.rglob("__pycache__"):
        if pycache_dir.exists():
            print(f"Removing __pycache__ directory: {pycache_dir}")
            shutil.rmtree(pycache_dir)
    
    # Remove other cache directories
    cache_dirs = [
        root_path / ".pytest_cache",
        root_path / "backend" / ".pytest_cache",
        root_path / ".mypy_cache", 
        root_path / ".ruff_cache",
        root_path / "backend" / ".ruff_cache",
        root_path / ".venv",  # Virtual environment directory
        root_path / "frontend" / ".expo",  # Expo cache directory
        root_path / "frontend" / ".nyc_output",  # Coverage directory
        root_path / "frontend" / "coverage",  # Coverage directory
        root_path / "frontend" / "node_modules"  # Frontend dependencies (will be reinstalled)
    ]
    
    for cache_dir in cache_dirs:
        if cache_dir.exists():
            print(f"Removing cache directory: {cache_dir}")
            shutil.rmtree(cache_dir)


def remove_temporary_files(root_dir):
    """Remove temporary files like .DS_Store and log files."""
    root_path = Path(root_dir)
    
    # Remove .DS_Store files
    for ds_store_file in root_path.rglob(".DS_Store"):
        if ds_store_file.exists():
            print(f"Removing .DS_Store file: {ds_store_file}")
            ds_store_file.unlink()
    
    # Remove log files
    log_files = [
        root_path / "backend_startup_new.log",
        root_path / "backend_server.log",
        root_path / "backend" / "backend_startup.log",
        root_path / "backend" / "data" / "mongod.log"
    ]
    
    for log_file in log_files:
        if log_file.exists():
            print(f"Removing log file: {log_file}")
            log_file.unlink()


def remove_nested_backend_duplicate(root_dir):
    """Remove the nested backend duplicate in _unwanted directory."""
    unwanted_backend = Path(root_dir) / "_unwanted" / "backend"
    
    if unwanted_backend.exists():
        print(f"Removing nested backend duplicate: {unwanted_backend}")
        shutil.rmtree(unwanted_backend)


def remove_remaining_unwanted_directory(root_dir):
    """Remove the remaining _unwanted directory if it exists."""
    unwanted_dir = Path(root_dir) / "_unwanted"
    
    if unwanted_dir.exists():
        print(f"Removing remaining _unwanted directory: {unwanted_dir}")
        shutil.rmtree(unwanted_dir)


def remove_worktree_duplicates(root_dir):
    """Remove worktree duplicates, keeping only the main project structure."""
    worktrees_dir = Path(root_dir) / "worktrees"
    
    if worktrees_dir.exists():
        print(f"Removing worktrees duplicate structures: {worktrees_dir}")
        # List all worktree subdirectories
        for worktree_dir in worktrees_dir.iterdir():
            if worktree_dir.is_dir():
                print(f"  Removing worktree: {worktree_dir.name}")
        shutil.rmtree(worktrees_dir)


def consolidate_log_files(root_dir):
    """Consolidate and clean up duplicate log files."""
    root_path = Path(root_dir)
    
    # Remove root level app.log files
    for log_file in root_path.glob("app.log*"):
        print(f"Removing root level log file: {log_file}")
        log_file.unlink()
    
    # Remove backend level app.log files if they exist
    backend_path = root_path / "backend"
    if backend_path.exists():
        for log_file in backend_path.glob("app.log*"):
            print(f"Removing backend log file: {log_file}")
            log_file.unlink()


def remove_duplicate_project_versions(base_path):
    """Remove duplicate project versions like Stock_final_baseline."""
    base_path_obj = Path(base_path).parent  # Go up one level from Stock_final
    
    # Find and remove duplicate project directories
    for item in base_path_obj.iterdir():
        if item.is_dir() and item.name.startswith("Stock_final_") and item.name != "Stock_final":
            if item.name != "Stock_final":  # Skip the main one
                print(f"Removing duplicate project directory: {item}")
                shutil.rmtree(item)


def main():
    """Main function to execute cleanup operations."""
    stock_final_path = "/Users/noufi1/stk_final/Stock_final"
    
    print("Starting comprehensive cleanup of duplicate and nested folders...")
    
    # Remove nested agent directories
    remove_nested_agent_directories(stock_final_path)
    
    # Remove backup files
    remove_backup_files(stock_final_path)
    
    # Remove legacy directories
    remove_legacy_directories(stock_final_path)
    
    # Remove archive files and distribution directories
    remove_archive_files(stock_final_path)
    
    # Remove cache directories
    remove_cache_directories(stock_final_path)
    
    # Remove temporary files
    remove_temporary_files(stock_final_path)
    
    # Remove nested backend duplicate
    remove_nested_backend_duplicate(stock_final_path)
    
    # Remove remaining unwanted directory
    remove_remaining_unwanted_directory(stock_final_path)
    
    # Remove worktree duplicates
    remove_worktree_duplicates(stock_final_path)
    
    # Consolidate log files
    consolidate_log_files(stock_final_path)
    
    # Remove duplicate project versions
    remove_duplicate_project_versions(stock_final_path)
    
    print("\nComprehensive cleanup completed successfully!")
    print("\nSummary of actions:")
    print("- Removed nested agent directories (.agent, .agents)")
    print("- Removed backup files (*.bak)")
    print("- Removed legacy directories")
    print("- Removed archive files and distribution directories")
    print("- Removed cache directories (__pycache__, .pytest_cache, .mypy_cache, etc.)")
    print("- Removed temporary files (.DS_Store, log files)")
    print("- Removed nested backend duplicate in _unwanted directory")
    print("- Removed remaining _unwanted directory")
    print("- Removed worktree duplicate structures") 
    print("- Cleaned up duplicate log files")
    print("- Removed duplicate project version directories")


if __name__ == "__main__":
    main()