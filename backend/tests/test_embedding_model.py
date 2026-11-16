"""Модель эмбеддингов должна справляться с длинными русскими текстами.
Регресс: mxbai-embed-large (английская, окно 512 токенов) отвечала HTTP 500 на записи
длиннее ~800 символов — на проде 14 из 38 векторов не считались.
Тест бьёт в реальную Ollama (как весь проект, см. conftest); если её нет — skip."""
import pytest

from app.services import ai

LONG_RU = ("Я заметил, что после долгой прогулки вечером мне проще формулировать мысли "
           "и принимать решения. ") * 80


@pytest.mark.asyncio
async def test_long_russian_text_gets_an_embedding():
    if await ai.get_embedding("проба") is None:
        pytest.skip("Ollama недоступна")
    text = LONG_RU[:6000]
    assert len(text) == 6000
    vec = await ai.get_embedding(text)
    assert vec is not None and len(vec) == 1024
