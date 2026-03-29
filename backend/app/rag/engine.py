from __future__ import annotations

import os
import threading
from pathlib import Path

import chromadb
from openai import OpenAI

DOCS_DIR = Path(__file__).parent / "documents"
COLLECTION_NAME = "strategy_docs"
EMBED_MODEL = "text-embedding-3-small"

_lock = threading.Lock()
_collection: chromadb.Collection | None = None


def _get_openai_client(api_key: str | None = None) -> OpenAI:
    key = api_key or os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError("OpenAI API 키가 필요합니다. 키를 입력해주세요.")
    return OpenAI(api_key=key)


def _embed(client: OpenAI, texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [item.embedding for item in response.data]


def _load_chunks() -> list[dict[str, str]]:
    chunks = []
    for path in sorted(DOCS_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 40]
        for i, para in enumerate(paragraphs):
            chunks.append({"id": f"{path.stem}_{i}", "text": para, "source": path.name})
    return chunks


def _get_collection(api_key: str | None = None) -> chromadb.Collection:
    global _collection
    with _lock:
        if _collection is not None:
            return _collection
        client = chromadb.Client()
        col = client.get_or_create_collection(COLLECTION_NAME, metadata={"hnsw:space": "cosine"})
        if col.count() == 0:
            chunks = _load_chunks()
            if chunks:
                oai = _get_openai_client(api_key)
                embeddings = _embed(oai, [c["text"] for c in chunks])
                col.add(
                    ids=[c["id"] for c in chunks],
                    documents=[c["text"] for c in chunks],
                    embeddings=embeddings,
                    metadatas=[{"source": c["source"]} for c in chunks],
                )
        _collection = col
        return _collection


def retrieve(query: str, n_results: int = 6, api_key: str | None = None) -> list[str]:
    col = _get_collection(api_key)
    oai = _get_openai_client(api_key)
    query_embedding = _embed(oai, [query])[0]
    count = col.count()
    if count == 0:
        return []
    results = col.query(query_embeddings=[query_embedding], n_results=min(n_results, count))
    return results["documents"][0] if results["documents"] else []
