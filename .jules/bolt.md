## 2024-05-24 - [List Rendering Optimization in React Native]
**Learning:** React Native's standard `FlatList` can suffer significant frame drops and memory issues when rendering long, complex items or paginated lists with infinite scrolling (like search results). The `VirtualList` component (which wraps `@shopify/flash-list`) is vastly superior for these use cases but requires a precisely calculated `estimatedItemSize` to function optimally.
**Action:** When working with potentially long lists in this codebase (especially in search or data tables), always prefer `VirtualList` over `FlatList`. Ensure you calculate an accurate `estimatedItemSize` by inspecting the item's layout and styles (padding, margins, font sizes) rather than guessing.## 2024-06-04 - N+1 query fix in sql_sync_service
**Learning:** Pre-fetching database documents into a local cache dictionary before a large batch loop drastically reduces network and I/O latency, effectively changing an O(n) querying pattern to an O(1) bulk fetch and an O(n) local lookup. In our sync logic, using motor.find({}) instead of loop-wise find_one(...) reduced processing time by 50%.
**Action:** Implemented dictionary-based cache argument `mongo_items_cache` for `_sync_single_item` and hydrated it in `nightly_full_sync` and `sync_quantities_only`.

## 2024-06-05 - Parallelize independent DB queries
**Learning:** Sequential execution of independent database queries causes unnecessary bottlenecks, especially when fetching aggregated data across different collections.
**Action:** Use `asyncio.gather()` to execute independent, read-only database queries concurrently. This reduces network and I/O latency significantly, preventing sequential `await` bottlenecks.
