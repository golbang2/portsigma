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
COLLECTION_NAME = "strategy_docs"
EMBED_MODEL = "text-embedding-3-small"

_lock = threading.Lock()
_collection: chromadb.Collection | None = None
_bm25: BM25Okapi | None = None
_bm25_chunks: list[dict[str, str]] = []


# ── tokenisation ──────────────────────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    """Simple Korean / English / numeric tokeniser for BM25."""
    tokens = re.findall(r"[가-힣]+|[a-zA-Z]+|\d+(?:\.\d+)?", text)
    return [t.lower() for t in tokens if len(t) > 1]


# ── chunking ──────────────────────────────────────────────────────────────────

def _load_chunks() -> list[dict[str, str]]:
    """
    Split each markdown file on level-2 headings (## …).
    The heading line is kept at the top of each chunk so the retriever
    knows which section it came from.
    """
    chunks: list[dict[str, str]] = []
    for path in sorted(DOCS_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        # Split on lines that start a new ## section
        sections = re.split(r"(?=^## )", text, flags=re.MULTILINE)
        for i, section in enumerate(sections):
            section = section.strip()
            if len(section) < 60:          # skip tiny fragments
                continue
            chunks.append({
                "id": f"{path.stem}_s{i}",
                "text": section,
                "source": path.name,
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

def _get_indices(api_key: str | None = None) -> tuple[chromadb.Collection, BM25Okapi, list[dict[str, str]]]:
    global _collection, _bm25, _bm25_chunks

    with _lock:
        if _collection is not None and _bm25 is not None:
            return _collection, _bm25, _bm25_chunks

        # ── ChromaDB (persistent) ──
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
                metadatas=[{"source": c["source"]} for c in chunks],
            )

        _collection = col

        # ── BM25 (in-memory, always rebuilt from chunks) ──
        tokenised = [_tokenize(c["text"]) for c in chunks]
        _bm25 = BM25Okapi(tokenised)
        _bm25_chunks = chunks

        return _collection, _bm25, _bm25_chunks


# ── retrieval ─────────────────────────────────────────────────────────────────

def _reciprocal_rank_fusion(
    rankings: list[list[str]],
    k: int = 60,
) -> list[str]:
    """Merge multiple ranked lists via RRF."""
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


def retrieve(
    query: str,
    n_results: int = 5,
    api_key: str | None = None,
) -> list[str]:
    col, bm25, chunks = _get_indices(api_key)

    if col.count() == 0:
        return []

    # ── Dense retrieval ──
    oai = _get_openai_client(api_key)
    query_embedding = _embed(oai, [query])[0]
    dense_raw = col.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results * 2, col.count()),
    )
    dense_ids: list[str] = dense_raw["ids"][0] if dense_raw["ids"] else []

    # ── Sparse retrieval (BM25) ──
    query_tokens = _tokenize(query)
    bm25_scores = bm25.get_scores(query_tokens)
    # Sort chunk indices by BM25 score, take top n_results*2
    top_indices = sorted(range(len(chunks)), key=lambda i: bm25_scores[i], reverse=True)[: n_results * 2]
    sparse_ids: list[str] = [chunks[i]["id"] for i in top_indices]

    # ── Reciprocal Rank Fusion ──
    merged_ids = _reciprocal_rank_fusion([dense_ids, sparse_ids])

    # Map id → document text
    id_to_text: dict[str, str] = {}
    if dense_raw["documents"]:
        for doc_id, doc in zip(dense_raw["ids"][0], dense_raw["documents"][0]):
            id_to_text[doc_id] = doc
    for chunk in chunks:
        id_to_text.setdefault(chunk["id"], chunk["text"])

    return [id_to_text[i] for i in merged_ids[:n_results] if i in id_to_text]
