"""
AI Search Service
Handles semantic search using sentence-transformers.
"""

import asyncio
import logging
from typing import Any, Optional

import numpy as np

# Configure logging
logger = logging.getLogger("ai_search")


class AISearchService:
    _instance = None
    _model = None
    _embeddings_cache: dict[str, np.ndarray] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def initialize_model(self):
        """
        Lazy load the model to avoid startup overhead if not used.
        """
        if self._model is not None:
            return

        try:
            from sentence_transformers import SentenceTransformer

            logger.info("Loading semantic search model (all-MiniLM-L6-v2)...")
            # fast, lightweight model
            self._model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Semantic search model loaded successfully.")
        except ImportError:
            logger.error("sentence-transformers not installed. Semantic search disabled.")
            self._model = None
        except Exception as e:
            logger.error(f"Failed to load semantic model: {e}")
            self._model = None

    def encode(self, text: str) -> Optional[np.ndarray]:
        """
        Generate embedding for a single string.
        """
        self.initialize_model()
        if self._model is None:
            return None

        try:
            return self._model.encode(text, convert_to_numpy=True)
        except Exception as e:
            logger.error(f"Encoding error: {e}")
            return None

    async def search_rerank(
        self, query: str, candidates: list[dict[str, Any]], top_k: int = 20
    ) -> list[dict[str, Any]]:
        """Rerank a list of candidate items based on semantic similarity to the query.

        ``sentence_transformers.encode()`` is synchronous CPU work — running it
        directly on the event loop thread blocks all other HTTP requests for the
        entire duration of the encode call (typically 50–500 ms per batch).

        This method offloads the encoding to the default thread-pool executor via
        ``asyncio.get_running_loop().run_in_executor``, so the event loop stays
        free to handle other requests while the CPU-bound work runs in a worker
        thread.  Only the final cosine-similarity computation (fast) and sorting
        (in-process) remain on the event loop.
        """
        self.initialize_model()
        if self._model is None or not candidates:
            return candidates[:top_k]

        try:
            from sentence_transformers import util

            # Pre-compute candidate texts on the event loop (cheap string ops)
            candidate_texts = [
                f"{item.get('item_name', '')} {item.get('category', '')} {item.get('subcategory', '')}"
                for item in candidates
            ]

            loop = asyncio.get_running_loop()

            def _encode_sync() -> tuple:
                """CPU-bound work — runs in thread pool."""
                q_emb = self._model.encode(query, convert_to_tensor=True)
                c_embs = self._model.encode(candidate_texts, convert_to_tensor=True)
                return q_emb, c_embs

            query_embedding, candidate_embeddings = await loop.run_in_executor(
                None, _encode_sync
            )

            # Cosine-similarity is a fast tensor op — stays on event loop
            scores = util.cos_sim(query_embedding, candidate_embeddings)[0]

            scored_candidates = [(score.item(), candidates[idx]) for idx, score in enumerate(scores)]
            scored_candidates.sort(key=lambda x: x[0], reverse=True)
            return [x[1] for x in scored_candidates[:top_k]]

        except Exception as e:
            logger.error("Semantic reranking failed: %s", e)
            return candidates[:top_k]


# Global instance
ai_search_service = AISearchService.get_instance()
