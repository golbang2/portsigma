from __future__ import annotations

import os
import re
import threading
from pathlib import Path

import chromadb
from openai import OpenAI
from rank_bm25 import BM25Okapi

DOCS_DIR = Path(__file__).parent / "documents"
CHROMA_PATH = Path(__file__).parent.parent.parent / "chroma_db"
COLLECTION_NAME = "strategy_docs_v2"   # v2: adds category metadata
EMBED_MODEL = "text-embedding-3-small"

# Document → retrieval category mapping
# Used for category boosting when factor_type is known
_DOC_CATEGORIES: dict[str, str] = {
    "00_hedge_decision_framework": "general",
    "01_hedge_basics":          "general",
    "02_beta_hedge":            "beta",
    "03_fx_hedge":              "fx",
    "04_correlation_strategy":  "general",
    "05_volatility_management": "volatility",
    "06_index_hedge_instruments": "beta",
    "07_var_position_sizing":   "var",
    "08_practical_hedge_guide": "general",
}

# 항상 컨텍스트에 포함할 문서 (헤지 적합성 판단 기준)
_ALWAYS_INCLUDE_SOURCE = "00_hedge_decision_framework.md"

# factor_type → preferred categories
_FACTOR_CATEGORY_MAP: dict[str, set[str]] = {
    "major_index": {"beta", "general"},
    "asset_fx":    {"fx",   "general"},
    "asset":       {"volatility", "var", "general"},
}

_lock = threading.Lock()
_collection: chromadb.Collection | None = None
_bm25: BM25Okapi | None = None
_bm25_chunks: list[dict[str, str]] = []


# ── tokenisation ──────────────────────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[가-힣]+|[a-zA-Z]+|\d+(?:\.\d+)?", text)
    return [t.lower() for t in tokens if len(t) > 1]


# ── chunking ──────────────────────────────────────────────────────────────────

def _load_chunks() -> list[dict[str, str]]:
    """Split each markdown file on ## headings; attach category metadata."""
    chunks: list[dict[str, str]] = []
    for path in sorted(DOCS_DIR.glob("*.md")):
        stem = path.stem
        category = _DOC_CATEGORIES.get(stem, "general")
        text = path.read_text(encoding="utf-8")
        sections = re.split(r"(?=^## )", text, flags=re.MULTILINE)
        for i, section in enumerate(sections):
            section = section.strip()
            if len(section) < 60:
                continue
            chunks.append({
                "id":       f"{stem}_s{i}",
                "text":     section,
                "source":   path.name,
                "category": category,
            })
    return chunks


# ── embeddings ────────────────────────────────────────────────────────────────

def _get_openai_client(api_key: str | None = None) -> OpenAI:
    key = api_key or os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError("OpenAI API 키가 필요합니다. 키를 입력해주세요.")
    return OpenAI(api_key=key)


def _embed(client: OpenAI, texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [item.embedding for item in response.data]


# ── index initialisation ──────────────────────────────────────────────────────

def _get_indices(
    api_key: str | None = None,
) -> tuple[chromadb.Collection, BM25Okapi, list[dict[str, str]]]:
    global _collection, _bm25, _bm25_chunks

    with _lock:
        if _collection is not None and _bm25 is not None:
            return _collection, _bm25, _bm25_chunks

        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        col = client.get_or_create_collection(
            COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

        chunks = _load_chunks()

        if col.count() == 0 and chunks:
            oai = _get_openai_client(api_key)
            embeddings = _embed(oai, [c["text"] for c in chunks])
            col.add(
                ids=[c["id"] for c in chunks],
                documents=[c["text"] for c in chunks],
                embeddings=embeddings,
                metadatas=[{"source": c["source"], "category": c["category"]} for c in chunks],
            )

        _collection = col

        tokenised = [_tokenize(c["text"]) for c in chunks]
        _bm25 = BM25Okapi(tokenised)
        _bm25_chunks = chunks

        return _collection, _bm25, _bm25_chunks


# ── helpers ───────────────────────────────────────────────────────────────────

def _rrf(rankings: list[list[str]], k: int = 60) -> list[str]:
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


def _category_boost(
    candidates: list[str],
    id_to_meta: dict[str, dict],
    factor_type: str | None,
    boost: float = 2.0,
) -> list[str]:
    """Re-sort candidates by giving a score bonus to preferred categories."""
    if not factor_type:
        return candidates

    preferred = _FACTOR_CATEGORY_MAP.get(factor_type, set())
    rrf_rank = {doc_id: i for i, doc_id in enumerate(candidates)}

    def sort_key(doc_id: str) -> float:
        rank = rrf_rank.get(doc_id, len(candidates))
        cat = id_to_meta.get(doc_id, {}).get("category", "general")
        bonus = boost if cat in preferred else 0.0
        return rank - bonus  # lower = better

    return sorted(candidates, key=sort_key)


def _source_diverse_rerank(
    candidates: list[str],
    id_to_meta: dict[str, dict],
    n: int,
) -> list[str]:
    """
    Greedy source-diversity reranking.
    First pass: pick the highest-ranked chunk per source document.
    Second pass: fill remaining slots from leftovers in original order.
    """
    selected: list[str] = []
    seen_sources: set[str] = set()

    # First pass – one chunk per source
    for doc_id in candidates:
        src = id_to_meta.get(doc_id, {}).get("source", "")
        if src not in seen_sources:
            selected.append(doc_id)
            seen_sources.add(src)
        if len(selected) >= n:
            return selected

    # Second pass – fill from duplicates
    for doc_id in candidates:
        if doc_id not in selected:
            selected.append(doc_id)
        if len(selected) >= n:
            break

    return selected


# ── public API ────────────────────────────────────────────────────────────────

def retrieve(
    query: str,
    n_results: int = 4,
    factor_type: str | None = None,
    api_key: str | None = None,
) -> list[str]:
    col, bm25, chunks = _get_indices(api_key)

    if col.count() == 0:
        return []

    pool = n_results * 3

    # ── Dense retrieval ──
    oai = _get_openai_client(api_key)
    query_emb = _embed(oai, [query])[0]
    dense_raw = col.query(
        query_embeddings=[query_emb],
        n_results=min(pool, col.count()),
        include=["documents", "metadatas"],
    )
    dense_ids: list[str] = dense_raw["ids"][0] if dense_raw["ids"] else []
    dense_docs: list[str] = dense_raw["documents"][0] if dense_raw["documents"] else []
    dense_metas: list[dict] = dense_raw["metadatas"][0] if dense_raw["metadatas"] else []

    # ── Sparse retrieval (BM25) ──
    bm25_scores = bm25.get_scores(_tokenize(query))
    top_sparse = sorted(range(len(chunks)), key=lambda i: bm25_scores[i], reverse=True)[:pool]
    sparse_ids = [chunks[i]["id"] for i in top_sparse]

    # ── RRF merge ──
    merged = _rrf([dense_ids, sparse_ids])[:pool]

    # ── Build id → text / meta lookup ──
    id_to_text: dict[str, str] = {}
    id_to_meta: dict[str, dict] = {}
    for doc_id, doc, meta in zip(dense_ids, dense_docs, dense_metas):
        id_to_text[doc_id] = doc
        id_to_meta[doc_id] = meta
    for chunk in chunks:
        id_to_text.setdefault(chunk["id"], chunk["text"])
        id_to_meta.setdefault(chunk["id"], {"source": chunk["source"], "category": chunk["category"]})

    # ── Category boost ──
    boosted = _category_boost(merged, id_to_meta, factor_type)

    # ── Source-diversity reranking ──
    final_ids = _source_diverse_rerank(boosted, id_to_meta, n_results)

    results = [id_to_text[i] for i in final_ids if i in id_to_text]

    # 헤지 적합성 판단 기준 문서는 항상 첫 번째로 포함 (중복 제거)
    framework_ids = [c["id"] for c in chunks if c["source"] == _ALWAYS_INCLUDE_SOURCE]
    framework_text = "\n\n".join(id_to_text[i] for i in framework_ids if i in id_to_text)
    non_framework = [id_to_text[i] for i in final_ids
                     if i in id_to_text and i not in framework_ids]
    return ([framework_text] + non_framework) if framework_text else non_framework
