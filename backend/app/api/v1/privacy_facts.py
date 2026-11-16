from fastapi import APIRouter
from app.services.privacy_facts import describe_privacy

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/privacy-facts")
async def privacy_facts() -> dict:
    """Сроки жизни входа и ссылок для страницы приватности (открытая точка, как и /meta/maturity-model)."""
    return describe_privacy()
