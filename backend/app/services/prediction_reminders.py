from app.core.prediction_status import OPEN_PREDICTION_STATUS
from datetime import datetime, timezone
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.entities import Prediction
from app.models.user import User, NotificationPrefs
from app.services.email import send_email, render_email_html, email_button, entity_tag, entity_url, esc

# Родительный падеж для дат в духе frontend/lib/theme.ts (toLocaleDateString с
# русской локалью) — там форматирование делает браузер, здесь для писем нужно
# явно, JS Intl на бэкенде нет.
_MONTHS_GENITIVE = {
    1: "января", 2: "февраля", 3: "марта", 4: "апреля", 5: "мая", 6: "июня",
    7: "июля", 8: "августа", 9: "сентября", 10: "октября", 11: "ноября", 12: "декабря",
}


def _format_ru_date(dt: datetime) -> str:
    return f"{dt.day} {_MONTHS_GENITIVE[dt.month]} {dt.year}"


async def send_due_prediction_reminders():
    """Раз в сутки: письмо по прогнозам, у которых подошла дата проверки и статус ещё 'не проверен'."""
    from app.core.entity_registry import get_system_user_id

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        # actor_id для ORM-driven event log (before_flush listener,
        # app/services/event_log.py) — этот джоб работает без HTTP-контекста,
        # неоткуда взять реального пользователя. Ставим явно, не полагаясь
        # на sync-фоллбэк листенера (защитный путь, не основной).
        db.sync_session.info["actor_id"] = await get_system_user_id(db)
        rows = (await db.execute(
            select(Prediction).where(
                Prediction.expected_check_date.is_not(None),
                Prediction.expected_check_date <= now,
                Prediction.status == OPEN_PREDICTION_STATUS,
                Prediction.reminder_sent == False,  # noqa: E712
                Prediction.deleted_at.is_(None),  # прогноз в корзине не напоминаем
            )
        )).scalars().all()

        for pred in rows:
            user = await db.get(User, pred.user_id)
            if not user:
                continue
            prefs = (await db.execute(select(NotificationPrefs).where(NotificationPrefs.user_id == user.id))).scalar_one_or_none()
            if prefs is not None and not prefs.prediction_reminders:
                pred.reminder_sent = True
                continue

            title = pred.title or pred.text[:80]
            check_date_str = _format_ru_date(pred.expected_check_date)
            link = entity_url("prediction", pred.slug) if pred.slug else "https://miridin.com/predictions"

            days_ago = None
            try:
                created = datetime.strptime(pred.date_created, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                days_ago = (now - created).days
            except (ValueError, TypeError):
                pass  # date_created в нестандартном формате — просто не показываем эту деталь
            age_line = (
                f'<p style="margin:4px 0 0 0;color:rgba(242,239,233,0.45);font-size:13px;">'
                f'Вы сделали этот прогноз {days_ago} дн. назад.</p>'
                if days_ago is not None else ""
            )

            overdue_days = (now - pred.expected_check_date).days
            overdue_line = (
                f'<p style="margin:4px 0 0 0;color:rgba(242,239,233,0.45);font-size:13px;">'
                f'Просрочено на {overdue_days} дн.</p>'
                if overdue_days > 0 else ""
            )

            await send_email(
                to=user.email,
                subject="Пора проверить прогноз в Meridian",
                body=f"«{title}» — дата проверки была {check_date_str}. "
                     f"Загляните в Meridian и отметьте результат.\n\n{link}",
                html=render_email_html(
                    preheader=esc(f"«{title}» — пора отметить результат"),
                    body_html=(
                        f'<p style="margin:0 0 14px 0;font-size:13px;color:rgba(242,239,233,0.45);">'
                        f'{entity_tag("prediction")}</p>'
                        f'<p style="margin:0 0 8px 0;">Пора проверить прогноз:</p>'
                        f'<p style="margin:0;padding:14px 18px;background:rgba(255,255,255,0.03);'
                        f'border-left:2px solid #4dcfa6;border-radius:4px;">«{esc(title)}»</p>'
                        f'<p style="margin:12px 0 0 0;color:rgba(242,239,233,0.45);font-size:13px;">'
                        f'Дата проверки была {check_date_str}.</p>'
                        f'{overdue_line}'
                        f'{age_line}'
                        f'{email_button(link, "Отметить результат")}'
                    ),
                ),
            )
            pred.reminder_sent = True

        await db.commit()
