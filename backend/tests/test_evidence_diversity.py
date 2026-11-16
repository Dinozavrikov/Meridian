"""
Тесты на evidence_diversity.py — чистые функции без БД.
"""

import pytest
from unittest.mock import MagicMock
from app.services.evidence_diversity import _normalize_author, _cosine, _cluster_sources


class TestNormalizeAuthor:
    def test_lowercases(self):
        assert _normalize_author("  Ivanov  ") == "ivanov"

    def test_empty_becomes_empty(self):
        assert _normalize_author("") == ""
        assert _normalize_author(None) == ""

    def test_already_normalized(self):
        assert _normalize_author("petrov") == "petrov"


class TestCosine:
    def test_identical_vectors(self):
        a = [1.0, 0.0, 0.0]
        assert _cosine(a, a) == pytest.approx(1.0)

    def test_orthogonal_vectors(self):
        a = [1.0, 0.0]
        b = [0.0, 1.0]
        assert _cosine(a, b) == pytest.approx(0.0)

    def test_opposite_vectors(self):
        a = [1.0, 0.0]
        b = [-1.0, 0.0]
        assert _cosine(a, b) == pytest.approx(-1.0)

    def test_zero_vector(self):
        assert _cosine([0.0, 0.0], [1.0, 0.0]) == 0.0


class TestClusterSources:
    def test_all_similar_one_bucket(self):
        """Три похожих источника → один бакет."""
        s1 = MagicMock()
        s1.id = 1
        s2 = MagicMock()
        s2.id = 2
        s3 = MagicMock()
        s3.id = 3
        emb = {
            1: [1.0, 0.0],
            2: [0.99, 0.01],
            3: [0.98, 0.02],
        }
        assert _cluster_sources([s1, s2, s3], emb) == 1

    def test_different_sources_separate_buckets(self):
        """Три разных источника → три бакета."""
        s1 = MagicMock()
        s1.id = 1
        s2 = MagicMock()
        s2.id = 2
        s3 = MagicMock()
        s3.id = 3
        emb = {
            1: [1.0, 0.0],
            2: [0.0, 1.0],
            3: [-1.0, 0.0],
        }
        assert _cluster_sources([s1, s2, s3], emb) == 3

    def test_missing_embedding_is_separate(self):
        """Без эмбеддинга — каждый в своём бакете (консервативно)."""
        s1 = MagicMock()
        s1.id = 1
        s2 = MagicMock()
        s2.id = 2
        emb = {1: [1.0, 0.0]}  # у s2 нет эмбеддинга
        assert _cluster_sources([s1, s2], emb) == 2
