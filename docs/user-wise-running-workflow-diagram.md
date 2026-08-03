# User-Wise Running Workflow

```mermaid
flowchart TD
    A["Supervisor/Admin opens User Workflows screen"] --> B["Frontend: /supervisor/user-workflows"]
    B --> C["API call: GET /api/sessions/user-workflows"]

    C --> D["Load active verification_sessions"]
    D --> E["Collect active session_ids by user"]

    E --> F["Load session metadata from sessions collection"]
    E --> G["Aggregate count_lines by session
- items_counted
- reviewed_items
- last_counted_at"]
    E --> H["Aggregate count_lines by user
- pending approvals
- assigned recounts"]
    E --> I["Load users collection
- full_name
- role"]

    F --> J["Merge data into one UserWorkflowSummary per username"]
    G --> J
    H --> J
    I --> J

    J --> K["Derive workflow_stage
- Counting
- Paused
- Reconciling
- Awaiting Review
- Recount Queue
- Idle"]
    J --> L["Derive presence_status
- online
- idle
- offline"]
    J --> M["Calculate progress_percent
items_counted / total_items"]

    K --> N["Return ordered workflow list"]
    L --> N
    M --> N

    N --> O["Frontend renders user cards"]
    O --> P["Shows per-user
- session
- warehouse/rack/floor
- progress
- pending review
- recount queue
- last activity"]
```

## Notes

- Source screen: `frontend/app/supervisor/user-workflows.tsx`
- Source endpoint: `backend/api/session_management_api.py`
- The view is available to supervisors and admins.

## End-to-End Functional Flow

```mermaid
flowchart LR
    subgraph Staff["Staff"]
        ST1["Login"]
        ST2["Start or Resume Session"]
        ST3["Scan / Search Item"]
        ST4["Enter Qty / Location / Notes / Photo"]
        ST5["Submit Count Line"]
        ST6{"Recount Assigned?"}
        ST7["Recount Item"]
        ST8["Complete Session"]
    end

    subgraph Supervisor["Supervisor"]
        SP1["Open Supervisor Dashboard"]
        SP2["Monitor User-wise Workflow"]
        SP3["Open Pending Review"]
        SP4{"Approve or Reject?"}
        SP5["Approve Count Line"]
        SP6["Reject and Assign Recount"]
        SP7["Pause / Reconcile Session if Needed"]
    end

    subgraph Admin["Admin"]
        AD1["Open Admin Dashboard / Live View"]
        AD2["Monitor Workflow + System Status"]
        AD3["Manage Users / Permissions / Logs"]
    end

    subgraph System["System"]
        SY1["Create or Update verification_session"]
        SY2["Store count_lines"]
        SY3["Update session progress"]
        SY4["Aggregate user-wise workflow summary"]
        SY5["Derive stage and presence status"]
        SY6["Return workflow data to dashboards"]
    end

    ST1 --> ST2
    ST2 --> SY1
    SY1 --> ST3
    ST3 --> ST4
    ST4 --> ST5
    ST5 --> SY2
    SY2 --> SY3
    SY3 --> SY4
    SY4 --> SY5
    SY5 --> SY6

    SY6 --> SP1
    SP1 --> SP2
    SP2 --> SP3
    SP3 --> SP4
    SP4 -->|Approve| SP5
    SP4 -->|Reject| SP6

    SP5 --> SY4
    SP6 --> SY4
    SP6 --> ST6
    ST6 -->|Yes| ST7
    ST7 --> ST5
    ST6 -->|No| ST8

    SP2 --> SP7
    SP7 --> SY4

    SY6 --> AD1
    AD1 --> AD2
    AD2 --> AD3
    AD3 --> SY4

    ST8 --> SY3
    SY3 --> SY4
```

## Swimlane Diagram

```mermaid
flowchart LR
    classDef staff fill:#1d4ed8,stroke:#0f172a,color:#ffffff,stroke-width:1px;
    classDef supervisor fill:#f59e0b,stroke:#451a03,color:#111827,stroke-width:1px;
    classDef admin fill:#7c3aed,stroke:#2e1065,color:#ffffff,stroke-width:1px;
    classDef system fill:#0f766e,stroke:#042f2e,color:#ffffff,stroke-width:1px;
    classDef decision fill:#f8fafc,stroke:#334155,color:#0f172a,stroke-width:1px;

    subgraph StaffLane["Staff"]
        direction TB
        ST1["Login"]:::staff
        ST2["Start / Resume Session"]:::staff
        ST3["Scan or Search Item"]:::staff
        ST4["Enter Qty / Notes / Photo"]:::staff
        ST5["Submit Count Line"]:::staff
        ST6{"Recount Assigned?"}:::decision
        ST7["Recount Item"]:::staff
        ST8["Complete Session"]:::staff
    end

    subgraph SupervisorLane["Supervisor"]
        direction TB
        SP1["Open Dashboard"]:::supervisor
        SP2["Monitor User-wise Workflow"]:::supervisor
        SP3["Open Pending Review"]:::supervisor
        SP4{"Approve or Reject?"}:::decision
        SP5["Approve Count Line"]:::supervisor
        SP6["Reject + Assign Recount"]:::supervisor
        SP7["Pause / Reconcile Session"]:::supervisor
    end

    subgraph AdminLane["Admin"]
        direction TB
        AD1["Open Admin Dashboard"]:::admin
        AD2["Review Live Operations"]:::admin
        AD3["Manage Users / Permissions / Logs"]:::admin
    end

    subgraph SystemLane["System"]
        direction TB
        SY1["Create / Update verification_session"]:::system
        SY2["Store count_lines"]:::system
        SY3["Update Session Progress"]:::system
        SY4["Aggregate User Workflow Summary"]:::system
        SY5["Derive Stage + Presence"]:::system
        SY6["Return Workflow Data"]:::system
    end

    ST1 --> ST2 --> SY1
    SY1 --> ST3 --> ST4 --> ST5 --> SY2
    SY2 --> SY3 --> SY4 --> SY5 --> SY6

    SY6 --> SP1 --> SP2 --> SP3 --> SP4
    SP4 -->|Approve| SP5 --> SY4
    SP4 -->|Reject| SP6 --> SY4
    SP6 --> ST6
    ST6 -->|Yes| ST7 --> ST5
    ST6 -->|No| ST8 --> SY3

    SP2 --> SP7 --> SY4

    SY6 --> AD1 --> AD2 --> AD3 --> SY4
```
