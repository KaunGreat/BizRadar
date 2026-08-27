"""project user_id — привязка анализов к пользователю

Добавляет projects.user_id (внешний ключ на users.id, nullable) и индекс
(user_id, created_at DESC) для быстрой выборки «Мои анализы». Существующие
записи получают NULL — они считаются гостевыми. См. backend/models.py.

Revision ID: 0003
Revises: 0002
Create Date: 2026-01-03 00:00:00

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_projects_user_id",
        "projects",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_projects_user_created", "projects", ["user_id", sa.text("created_at DESC")])


def downgrade() -> None:
    op.drop_index("idx_projects_user_created", table_name="projects")
    op.drop_constraint("fk_projects_user_id", "projects", type_="foreignkey")
    op.drop_column("projects", "user_id")
