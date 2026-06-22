## 2026-06-22 - MongoDB $facet Memory Anti-pattern
**Learning:** Using `$facet` to consolidate independent queries (like getting multiple simple counts or small aggregations) is an anti-pattern. Because `$facet` sub-pipelines cannot utilize indexes, it forces MongoDB to read the entire collection into memory, severely impacting performance as datasets grow.
**Action:** Use `asyncio.gather()` to run these independent queries concurrently. This parallelizes the IO bounds while allowing the database to successfully hit indexes for each individual pipeline.
