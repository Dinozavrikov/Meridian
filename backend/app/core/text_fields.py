"""Реестр Text-колонок: rich (HTML из RichTextEditor, в нём бывают ссылки <a href="meridian://тип/id">) и plain.
Упоминания (entity_mentions) извлекаются только из rich-полей. Охранный тест tests/test_text_fields_registry.py
требует, чтобы каждая Text-колонка моделей была здесь либо в RICH, либо в PLAIN (ключ: имя класса модели)."""

RICH_TEXT_FIELDS: dict[str, frozenset[str]] = {
    "Observation":  frozenset({"text"}),
    "Prediction":   frozenset({"text"}),
    "Hypothesis":   frozenset({"description"}),
    "Question":     frozenset({"text", "answer"}),
    "Worldview":    frozenset({"confirming_data", "refuting_data"}),
    "Result":       frozenset({"body"}),
    # предложенная правка результата: пока pending, не публикуется; при принятии текст переходит в Result.body
    "ResultEditSuggestion": frozenset({"proposed_body"}),
}

PLAIN_TEXT_FIELDS: dict[str, frozenset[str]] = {
    "Hypothesis":        frozenset({"falsification_criteria"}),
    "Prediction":        frozenset({"result_notes"}),
    "Worldview":         frozenset({"belief"}),
    "ResearchTask":      frozenset({"description"}),
    "EntityReflection":  frozenset({"raw_dialogue_text"}),
    "UserThinkingPattern": frozenset({"summary"}),
    "EntityReflectionInsight": frozenset({"insight"}),
    "ScaleDef":          frozenset({"description", "levels"}),
    "MaturitySuggestion": frozenset({"reason"}),
    "TaskScale":         frozenset({"description", "value_labels"}),
    "SourceDocument":    frozenset({"summary", "verdict_reason", "error_msg", "weight_reason"}),
    "EntityImage":       frozenset({"description"}),
    "EntityEmbedding":   frozenset({"text_snapshot"}),
    "ContradictionFeedback": frozenset({"existing_quote", "new_quote"}),
    "TaskExpectation":   frozenset({"expectation_text", "outcome_text"}),
    "QuestionAnswerFeedback": frozenset({"matched_quote"}),
    "EntityAttachment":  frozenset({"text_content", "description"}),
    "EntityAttachmentVersion": frozenset({"text_content"}),
    "Lab":               frozenset({"description"}),
    "LabJoinRequest":    frozenset({"message", "decline_reason"}),
    "HypothesisPost":    frozenset({"content"}),
    "PostComment":       frozenset({"content"}),
    "ObservationPost":   frozenset({"content"}),
    "EntityComment":     frozenset({"content"}),
    "Repost":            frozenset({"comment"}),
    "User":              frozenset({"bio"}),
    "UIStringTranslation": frozenset({"key", "translated_text"}),
}
