"""add result_source_links table

Revision ID: a7c3f1e9b204
Revises: f330c028a718
Create Date: 2026-08-16 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c3f1e9b204'
down_revision: Union[str, None] = 'f330c028a718'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('result_source_links',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('result_id', sa.Integer(), nullable=False),
    sa.Column('source_document_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['result_id'], ['results.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['source_document_id'], ['source_documents.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('result_id', 'source_document_id', name='result_source_links_unique')
    )
    op.create_index(op.f('ix_result_source_links_result_id'), 'result_source_links', ['result_id'], unique=False)
    op.create_index(op.f('ix_result_source_links_source_document_id'), 'result_source_links', ['source_document_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_result_source_links_source_document_id'), table_name='result_source_links')
    op.drop_index(op.f('ix_result_source_links_result_id'), table_name='result_source_links')
    op.drop_table('result_source_links')
