## 2024-06-17 - Sequential count_documents optimizations
**Learning:** Found several places where sequential `count_documents` requests are made for the same collection (e.g. `error_log.py`, `activity_log.py`, `enterprise_security.py`). Memory suggests: "For MongoDB performance optimization in the backend, consolidate multiple sequential count_documents and aggregate queries into a single aggregation pipeline using the $facet stage to significantly reduce database round-trips."
**Action:** Replace multiple `count_documents` calls with a single `$facet` aggregation to optimize performance.
