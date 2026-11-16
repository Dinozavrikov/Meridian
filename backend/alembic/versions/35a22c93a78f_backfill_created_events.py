"""backfill created events

Revision ID: 35a22c93a78f
Revises: af9ae66e3174
Create Date: 2026-08-10 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = '35a22c93a78f'
down_revision: Union[str, None] = 'af9ae66e3174'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. created events for the 5 entity types currently in the feed ---
    # (research_tasks are NOT in feed.py's union today — excluded here too,
    # to match existing feed behavior rather than silently expand scope)
    op.execute("""
        INSERT INTO events (type, actor_id, entity_type, entity_id, lab_id, visibility, meta, created_at)
        SELECT 'created', user_id, 'observation', id, lab_id, visibility, '{}'::jsonb, created_at FROM observations
        UNION ALL
        SELECT 'created', user_id, 'hypothesis', id, lab_id, visibility, '{}'::jsonb, created_at FROM hypotheses
        UNION ALL
        SELECT 'created', user_id, 'prediction', id, lab_id, visibility, '{}'::jsonb, created_at FROM predictions
        UNION ALL
        SELECT 'created', user_id, 'worldview', id, lab_id, visibility, '{}'::jsonb, created_at FROM worldview
        UNION ALL
        SELECT 'created', user_id, 'question', id, lab_id, visibility, '{}'::jsonb, created_at FROM questions
    """)

    # --- 2. shared meta CTE: (etype, eid, owner_id, lab_id, visibility, created_at) ---
    # across every type Link/EntityHypothesis can point at (includes tasks, unlike step 1 —
    # a link CAN touch a task even though tasks don't get their own 'created' event yet)
    entity_meta_cte = """
        WITH entity_meta AS (
            SELECT 'observation' etype, id eid, user_id owner_id, lab_id, visibility, created_at FROM observations
            UNION ALL
            SELECT 'hypothesis', id, user_id, lab_id, visibility, created_at FROM hypotheses
            UNION ALL
            SELECT 'prediction', id, user_id, lab_id, visibility, created_at FROM predictions
            UNION ALL
            SELECT 'worldview', id, user_id, lab_id, visibility, created_at FROM worldview
            UNION ALL
            SELECT 'question', id, user_id, lab_id, visibility, created_at FROM questions
            UNION ALL
            SELECT 'task', id, user_id, lab_id, visibility, created_at FROM research_tasks
        )
    """

    # --- 3. linked events, backfilled from existing links ---
    # lab/visibility context = whichever side belongs to the link's own author (actor);
    # date = the later of the two sides' created_at (best guess, exact link time unknown)
    op.execute(entity_meta_cte + """
        INSERT INTO events (type, actor_id, entity_type, entity_id, related_type, related_id, lab_id, visibility, meta, created_at)
        SELECT
            'linked', l.user_id,
            l.from_type, l.from_id, l.to_type, l.to_id,
            COALESCE(fm.lab_id, tm.lab_id),
            CASE WHEN fm.owner_id = l.user_id THEN fm.visibility ELSE tm.visibility END,
            jsonb_build_object('link_type', l.link_type),
            GREATEST(fm.created_at, tm.created_at)
        FROM links l
        JOIN entity_meta fm ON fm.etype = l.from_type AND fm.eid = l.from_id
        JOIN entity_meta tm ON tm.etype = l.to_type AND tm.eid = l.to_id
    """)
    # (COALESCE above: prefer the actor-owned side's lab_id, but if neither side happens
    # to be actor-owned per the join above, fall back to whichever is non-null — edge case,
    # flagged rather than silently guessed further)

    # --- 4. competing_hypothesis events, backfilled from entity_hypotheses ---
    # actor = hypothesis owner (EntityHypothesis has no user_id of its own);
    # lab/visibility context = the PARENT (task/question), not the hypothesis itself —
    # see rationale in chat: a private hypothesis proposed into a lab's question must
    # surface in that lab's feed, not vanish into the hypothesis's own private scope
    op.execute(entity_meta_cte + """
        INSERT INTO events (type, actor_id, entity_type, entity_id, related_type, related_id, lab_id, visibility, meta, created_at)
        SELECT
            'competing_hypothesis', hm.owner_id,
            'hypothesis', eh.hypothesis_id, eh.parent_type, eh.parent_id,
            pm.lab_id, pm.visibility,
            '{}'::jsonb,
            GREATEST(hm.created_at, pm.created_at)
        FROM entity_hypotheses eh
        JOIN entity_meta hm ON hm.etype = 'hypothesis' AND hm.eid = eh.hypothesis_id
        JOIN entity_meta pm ON pm.etype = eh.parent_type AND pm.eid = eh.parent_id
    """)


def downgrade() -> None:
    op.execute("DELETE FROM events WHERE type IN ('created', 'linked', 'competing_hypothesis')")
