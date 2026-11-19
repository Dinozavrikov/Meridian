"""Реестр GET-маршрутов: каждый маршрут либо содержит признак проверки видимости, либо классифицирован здесь.
REGISTRY — прочитано и подтверждено (класс: причина). UNREAD — ещё не читали; список только сокращается.
Новый GET без признака защиты и без записи роняет тест: решение о доступе принимается явно."""
import inspect


from app.main import app
from tests.route_utils import iter_api_routes

GUARD_TOKENS = ("get_entity_for_view", "get_entity_for_read", "entity_visibility_filter", "opened_via_link",
                "get_entity_for_lab_manage", "can_link", "lab_scope_condition", "_lab_role", "get_live")

REGISTRY = {
    "feed.public_recently_confirmed": "PUBLIC: только visibility == public",
    "feed.public_graph_teaser": "PUBLIC: только публичные записи и связи между ними",
    "maturity_model.get_maturity_model": "PUBLIC: статичное описание формулы зрелости, данных пользователей нет",
    "privacy_facts.privacy_facts": "PUBLIC: статичные сроки жизни входа и ссылок из настроек сервиса, данных пользователей нет",
    "feed.public_sitemap": "PUBLIC: только visibility == public и не удалена; отдает тип, id и время, без текстов и авторов",
    "global_graph.global_graph_overview": "PUBLIC: только visibility == public, рёбра между публичными",
    "global_graph.global_graph_all": "PUBLIC: только visibility == public, рёбра между публичными",
    "graph.global_blind_spots": "PUBLIC: только visibility == public",
    "labs.public_labs": "PUBLIC: только is_public лаборатории (поля LabOut не читал)",
    "labs.get_members": "LAB/PUBLIC: закрытая лаборатория 403/401; калибровка только участникам",
    "search.search": "SELF: свои записи + публичные лаборатории и свои",
    "main.health": "PUBLIC: проверка живости сервиса (тело не читал, проверить, что данных не отдаёт)",
    "undo.entity_history": "OWNER: _load_live_owned",
    "undo.link_history": "OWNER: _load_live_owned + только свои события share_*",
    "hypotheses.get_suggested_observations": "OWNER: user_id == user.id в запросе",
    "hypotheses.get_maturity_suggestion": "OWNER: user_id == user.id в запросе",
    "hypotheses.get_maturity_progress": "OWNER или участник: can_see_lab_effect",
    "results.list_available_lab_sources": "OWNER: Result.user_id == user.id",
    "entity_visibility.list_shares": "OWNER: _own_live",
    "observations.list_obs_reflections": "OWNER: require_owned_entity",
    "observations.list_obs_insights": "OWNER: require_owned_entity",
    "predictions.list_reflections": "OWNER: require_owned_entity",
    "predictions.list_insights": "OWNER: require_owned_entity",
    "worldview.list_wv_reflections": "OWNER: require_owned_entity",
    "worldview.list_wv_insights": "OWNER: require_owned_entity",
    "graph.get_graph": "SELF: только записи user.id",
    "graph.blind_spots": "SELF: только записи user.id",
    "graph.lab_blind_spots": "LAB: публичная лаборатория или участник; НЕ фильтрует visibility записей (держится на resolve_lab_attachment)",
    "labs.lab_signal_summary": "LAB: _is_lab_participant, чужим 404",
    "labs.list_join_requests": "LAB: owner/admin",
    "feed.public_feed_groups": "PUBLIC: только visibility == public у самой записи (не копия в events), удалённые скрыты",
    "feed.lab_feed_groups": "LAB: публичная лаборатория или участник; не-участнику только visibility == public",
    "lab_checkpoints.checkpoints_storage": "LAB: role is None -> 404",
    "lab_checkpoints.verify_checkpoint": "LAB: role is None -> 404",
    "lab_checkpoints.download_checkpoint_file": "LAB: role is None -> 404",
    "attachments.get_attachment": "HELPER: _get_viewable -> get_entity_for_read",
    "attachments.download_attachment": "HELPER: _get_viewable -> get_entity_for_read",
    "attachments.list_attachment_versions": "HELPER: _get_viewable -> get_entity_for_read",
    "attachments.download_attachment_version": "HELPER: _get_viewable -> get_entity_for_read",
    "images.list_images": "HELPER: _require_view -> get_entity_for_read",
    "comments.get_comments": "HELPER: _check_entity_access -> get_entity_for_read (читать может и тот, кому запись открыта через связь; писать нельзя)",
    "comments.unread_summary": "HELPER: _check_entity_access по каждой записи группы",
}

UNREAD = {
    "all_sources.list_all_sources", "auth.me", "auth.list_sessions", "auth.google_available", "auth.google_login",
    "auth.google_callback", "contradictions.list_pending", "entity_stage.get_stage",
    "hypotheses.tag_calibration", "lab_checkpoints.list_checkpoints",
    "lab_checkpoints.diff_checkpoints", "lab_checkpoints.view_checkpoint", "labs.my_labs", "messages.list_conversations", "messages.get_conversation_with", "messages.unread_count",
    "questions.list_pending_answers", "results.list_results", "scales.list_custom_scales",
    "scales.get_builtin_overrides", "scales.get_values", "sources.list_sources", "stats.get_stats",
    "stats.get_dashboard", "tasks.list_pending_expectations", "trash.list_trash", "users.list_thinking_patterns",
    "users.get_me", "users.get_profile", "users.get_profile_stats", "users.get_notification_prefs",
    "users.export_my_data",
}


def _routes():
    return [r for r in iter_api_routes() if "GET" in r.methods]


def _key(r):
    return f"{r.endpoint.__module__.rsplit('.', 1)[-1]}.{r.endpoint.__name__}"


def test_every_get_route_is_classified():
    missing = sorted({_key(r) for r in _routes()
                      if not any(t in inspect.getsource(r.endpoint) for t in GUARD_TOKENS)
                      and _key(r) not in REGISTRY and _key(r) not in UNREAD})
    assert not missing, f"GET без проверки видимости и без записи в реестре: {missing}"


def test_registry_has_no_stale_entries():
    stale = sorted((set(REGISTRY) | UNREAD) - {_key(r) for r in _routes()})
    assert not stale, f"маршрутов уже нет (переименованы или удалены): {stale}"


def test_registry_and_unread_are_disjoint():
    assert not set(REGISTRY) & UNREAD
