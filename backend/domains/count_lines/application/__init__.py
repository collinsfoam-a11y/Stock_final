"""Application layer (use cases) for the count-line bounded context.

Not yet built. This BSR pass (Part F) scoped the extraction to the domain/
layer only (value objects + DuplicateDetectionPolicy), per the explicit
instruction not to perform a broad rewrite. A future increment can add
use cases here (e.g. a SubmitCountLine orchestrator) once the domain
layer has been in use long enough to validate the value-object shapes,
and once real repository/gateway ports are designed against the actual
CountLineWriteService/canonical_inventory call shapes -- not before.
"""
