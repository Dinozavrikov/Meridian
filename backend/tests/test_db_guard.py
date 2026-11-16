"""Защита от TRUNCATE по рабочей БД: разрешена только postgres-test/*_test."""
import pytest
from sqlalchemy.engine import make_url

from tests.conftest import assert_safe_test_db


def test_allows_test_db():
    assert_safe_test_db(make_url("postgresql+asyncpg://u:p@postgres-test:5432/meridian_test"))


@pytest.mark.parametrize("url", [
    "postgresql+asyncpg://u:p@postgres:5432/meridian",
    "postgresql+asyncpg://u:p@postgres:5432/meridian_test",
    "postgresql+asyncpg://u:p@postgres-test:5432/meridian",
    "postgresql+asyncpg://u:p@localhost:5432/meridian_test",
])
def test_refuses_everything_else(url):
    with pytest.raises(BaseException) as e:   # pytest.exit бросает Exit (не Exception)
        assert_safe_test_db(make_url(url))
    assert "ОТКАЗ" in str(e.value)
