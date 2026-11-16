import aiosmtplib
import html as _html
from email.message import EmailMessage
from app.core.config import settings

# Общий HTML-шаблон писем — палитра взята из frontend/lib/theme.ts (v2),
# чтобы письма визуально совпадали с темой сайта.
_BG = "#0b0d14"
_SURF = "#111420"
_BORDER = "rgba(255,255,255,0.07)"
_TEXT = "#f2efe9"
_TEXT_FAINT = "rgba(242,239,233,0.45)"  # чуть контрастнее t3, в письме на светлом фоне почт. клиента 35% местами нечитаемо
_TEAL = "#4dcfa6"

# Метаданные типов сущностей — цвета 1:1 с frontend/lib/utils.ts (TYPE_COLORS),
# подписи 1:1 с TYPE_RU. Держать в синхроне вручную, т.к. это два разных
# рантайма (TS/Python) без общего источника правды.
ENTITY_LABELS = {
    "observation": "Наблюдение",
    "hypothesis": "Гипотеза",
    "prediction": "Прогноз",
    "worldview": "Убеждение",
    "question": "Вопрос",
    "task": "Задача",
}
ENTITY_COLORS = {
    "observation": "#2ECC71",
    "hypothesis": "#4A90D9",
    "prediction": "#F5A623",
    "worldview": "#9B59B6",
    "question": "#1ABC9C",
    "task": "#E84393",
}
# Форма "ваш/-а/-е <сущность>" в винительном падеже — выведена из рода
# соответствующего существительного в ENTITY_LABELS (средний/женский/мужской).
ENTITY_POSSESSIVE_ACC = {
    "observation": "ваше наблюдение",
    "hypothesis": "вашу гипотезу",
    "prediction": "ваш прогноз",
    "worldview": "ваше убеждение",
    "question": "ваш вопрос",
    "task": "вашу задачу",
}
_ENTITY_URL_PATH = {
    "observation": "observations",
    "hypothesis": "hypotheses",
    "prediction": "predictions",
    "worldview": "worldview",
    "question": "questions",
    "task": "tasks",
}


def esc(value) -> str:
    """HTML-экранирование пользовательского текста перед вставкой в письмо
    (имена, превью комментариев/сообщений, заголовки сущностей — всё это
    вводит другой человек, доверять сырому виду нельзя).    """
    return _html.escape(str(value))


def entity_url(entity_type: str, slug: str) -> str:
    """Прямая ссылка на карточку сущности (тот же паттерн, что и в самом приложении)."""
    path = _ENTITY_URL_PATH[entity_type]
    return f"https://miridin.com/{path}?id={slug}&tab=detail"


def render_email_html(body_html: str, preheader: str = "") -> str:
    """Оборачивает контент письма в общий шаблон с логотипом Meridian и футером."""
    return f"""<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:{_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">{preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BG};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:{_SURF};border:1px solid {_BORDER};border-radius:14px;">
            <tr>
              <td style="padding:56px 48px 0 48px;text-align:center;">
                <div style="font-size:26px;font-weight:700;letter-spacing:0.08em;color:{_TEXT};">
                  MER<span style="color:{_TEAL};">I</span>DIAN
                </div>
                <div style="margin-top:10px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:{_TEXT_FAINT};">
                  От догадки — к уверенности
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 48px 0 48px;">
                <div style="height:1px;background:{_BORDER};"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 48px 40px 48px;color:{_TEXT};font-size:15px;line-height:1.8;">
                {body_html}
              </td>
            </tr>
            <tr>
              <td style="padding:0 48px 40px 48px;">
                <div style="height:1px;background:{_BORDER};margin-bottom:20px;"></div>
                <div style="font-size:12px;color:{_TEXT_FAINT};line-height:1.7;">
                  Получаете это письмо по настройкам уведомлений вашего аккаунта Meridian.
                  <a href="https://miridin.com/settings/notifications" style="color:{_TEAL};text-decoration:none;">Настроить, какие письма приходить</a>
                </div>
              </td>
            </tr>
          </table>
          <div style="color:{_TEXT_FAINT};font-size:11px;margin-top:20px;">Meridian · miridin.com</div>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def email_button(url: str, label: str) -> str:
    return (
        f'<a href="{url}" '
        f'style="display:inline-block;margin-top:24px;padding:12px 24px;'
        f'background:{_TEAL};color:{_BG};text-decoration:none;border-radius:8px;'
        f'font-weight:600;font-size:14px;">{label}</a>'
    )


def entity_tag(entity_type: str) -> str:
    """Цветной бейдж с типом сущности — тот же паттерн акцентов, что и на сайте."""
    color = ENTITY_COLORS[entity_type]
    label = ENTITY_LABELS[entity_type]
    return (
        f'<span style="display:inline-block;padding:3px 10px;border-radius:6px;'
        f'background:{color}22;color:{color};font-size:11px;font-weight:600;'
        f'text-transform:uppercase;letter-spacing:0.04em;">{label}</span>'
    )


async def send_email(to: str, subject: str, body: str, html: str | None = None) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")

    kwargs = dict(hostname=settings.SMTP_HOST, port=settings.SMTP_PORT)
    if settings.SMTP_USER:
        # Реальный relay (Resend и т.п.) — аутентификация + STARTTLS.
        # mailpit (dev) не поддерживает ни то, ни другое, поэтому включаем
        # только когда SMTP_USER реально задан в окружении.
        kwargs["username"] = settings.SMTP_USER
        kwargs["password"] = settings.SMTP_PASSWORD
        kwargs["start_tls"] = settings.SMTP_USE_TLS
    await aiosmtplib.send(msg, **kwargs)
