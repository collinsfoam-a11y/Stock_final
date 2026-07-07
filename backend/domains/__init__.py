"""Bounded-context modules under controlled clean-architecture migration.

Each subpackage here (e.g. count_lines) holds domain/ and application/
layers extracted from the corresponding backend/api + backend/services
code, following ports-and-adapters: domain/ and application/ never import
fastapi, motor, pymongo, or anything under backend.api/backend.db. Nothing
under backend/domains is wired into the running application yet -- see
each subpackage's README note for migration status.
"""
