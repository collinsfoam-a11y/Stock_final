## 2026-07-27 - PyMongo Sequential I/O Bottlenecks in Reports
**Learning:** System reports often aggregated multiple collections (e.g. login_history, activity_logs, audit_logs) by sequentially awaiting PyMongo's `to_list()` or `find()` cursors. Because PyMongo is inherently non-blocking, these distinct and independent read operations create a massive latency bottleneck when executed sequentially in Python `for` loops.
**Action:** When aggregating independent datasets from multiple collections, always map the operations to `asyncio.gather(...)` to execute the database fetches concurrently. This typically reduces I/O wait times linearly by a factor of the number of collections fetched.

## 2024-05-24 - [List Rendering Optimization in React Native]
**Learning:** React Native's standard `FlatList` can suffer significant frame drops and memory issues when rendering long, complex items or paginated lists with infinite scrolling (like search results). The `VirtualList` component (which wraps `@shopify/flash-list`) is vastly superior for these use cases but requires a precisely calculated `estimatedItemSize` to function optimally.
**Action:** When working with potentially long lists in this codebase (especially in search or data tables), always prefer `VirtualList` over `FlatList`. Ensure you calculate an accurate `estimatedItemSize` by inspecting the item's layout and styles (padding, margins, font sizes) rather than guessing.## 2024-06-04 - N+1 query fix in sql_sync_service
**Learning:** Pre-fetching database documents into a local cache dictionary before a large batch loop drastically reduces network and I/O latency, effectively changing an O(n) querying pattern to an O(1) bulk fetch and an O(n) local lookup. In our sync logic, using motor.find({}) instead of loop-wise find_one(...) reduced processing time by 50%.
**Action:** Implemented dictionary-based cache argument `mongo_items_cache` for `_sync_single_item` and hydrated it in `nightly_full_sync` and `sync_quantities_only`.

## 2024-07-11 - Fix N+1 queries in loop validation logic
**Learning:** Checking idempotency constraints or performing validations via database lookups *inside* a loop that processes batched records is a significant performance bottleneck due to sequential N+1 queries.
**Action:** When a batch process iterates over multiple records, always extract necessary constraints (e.g., `client_record_id`) into a list first. Then perform a single bulk query (e.g., `db.collection.find({"field": {"$in": constraints}}).to_list(length=None)`) and build an in-memory dictionary or set for $O(1)$ lookups during the main processing loop.

## 2024-08-20 - In-Memory Database Counting
**Learning:** Fetching up to 5000 full documents into application memory using `to_list()` merely to iterate and count how many match a condition is a massive anti-pattern that severely spikes network I/O, deserialization time, and CPU utilization.
**Action:** Replace all instances of in-memory iterations purely meant for counting with native MongoDB database operators (e.g. `collection.count_documents(query)`), being sure to strictly replicate missing/null handling exactly via `$exists` and `$ne`.
## 2026-07-27 - Fast-path N+1 query loops using pre-fetched memory context
**Learning:** Functions that perform dictionary enrichment by looking up database items (like `calculate_completeness` calling `find_one(item_code)`) become an N+1 query bottleneck when invoked inside loops that iterate over collections already fetched via `find().to_list()`.
**Action:** Always provide an optional `prefetched_item: dict = None` parameter on data-enriching functions and pass the existing loop variable context to safely skip the database lookup when the item is already present in memory.
