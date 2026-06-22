> **Document status:** Production reference  
> **Last reviewed:** 22 June 2026  
> **Operational authority:** Current repository README, SECURITY policy and operations guide.

# Compact Repository Health Dashboard

The Ops overview now presents two compact two-column card groups:

1. Repository and service health, sourced from `GET /v1/system/repo-health`.
2. Existing HIVE operational/configuration flags, reduced to compact cards.

Each repository card shows the service category, aggregate status, liveness latency, and operational status where available. Full details remain in the existing right-hand inspector.

AIMS and RAMS are labelled as background APIs. HIVE reports liveness plus deeper operational/readiness results for them because a green process alone does not prove that external dependencies are usable.

The repository-health request is optional within the overview load. A temporary remote health failure does not prevent the rest of Ops from rendering.

## Responsive check

Both card groups use a two-column grid. Verify the deployed screen on the narrowest supported Android viewport; labels and details are intentionally truncated with complete values available in the inspector.
