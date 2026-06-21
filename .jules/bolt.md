## 2024-05-24 - [List Rendering Optimization in React Native]
**Learning:** React Native's standard `FlatList` can suffer significant frame drops and memory issues when rendering long, complex items or paginated lists with infinite scrolling (like search results). The `VirtualList` component (which wraps `@shopify/flash-list`) is vastly superior for these use cases but requires a precisely calculated `estimatedItemSize` to function optimally.
**Action:** When working with potentially long lists in this codebase (especially in search or data tables), always prefer `VirtualList` over `FlatList`. Ensure you calculate an accurate `estimatedItemSize` by inspecting the item's layout and styles (padding, margins, font sizes) rather than guessing.## 2024-06-04 - N+1 query fix in sql_sync_service
**Learning:** Pre-fetching database documents into a local cache dictionary before a large batch loop drastically reduces network and I/O latency, effectively changing an O(n) querying pattern to an O(1) bulk fetch and an O(n) local lookup. In our sync logic, using motor.find({}) instead of loop-wise find_one(...) reduced processing time by 50%.
**Action:** Implemented dictionary-based cache argument `mongo_items_cache` for `_sync_single_item` and hydrated it in `nightly_full_sync` and `sync_quantities_only`.

## 2026-06-21 - [Backend: N+1 Query Resolution via Cache]
**Learning:** Querying the database within a loop using `find_one` (an N+1 query pattern) introduces severe performance bottlenecks due to network roundtrips.
**Action:** Resolve N+1 issues by first extracting unique identifiers into a list, executing a single bulk `$in` query, mapping the results to an in-memory dictionary cache, and performing O(1) lookups inside the loop.

## 2026-06-21 - [Backend: $facet Anti-Pattern]
**Learning:** Using the MongoDB `$facet` aggregation stage to consolidate independent metric queries (like `count_documents` and `aggregate`) is a performance anti-pattern. `$facet` sub-pipelines cannot utilize indexes, forcing MongoDB to load all matching documents into memory, which may exceed limits and drastically degrade performance.
**Action:** Do not use `$facet` for query consolidation. Instead, rely on `asyncio.gather()` to run multiple index-backed queries concurrently.

## 2026-06-21 - [Frontend: Premature Optimization]
**Learning:** Replacing React Native's standard `FlatList` with `VirtualList` (`FlashList`) for short, simple lists (like filter modals with 10-50 options) is a premature optimization. It introduces unnecessary complexity and potential layout regressions (especially inside dynamically sized modals) without any measurable performance gain.
**Action:** Reserve `VirtualList` strictly for rendering long, complex, or infinitely scrolling lists where frame drops or memory bloat are explicitly identified as bottlenecks.
