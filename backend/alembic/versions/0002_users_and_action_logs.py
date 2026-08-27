"""users and action_logs

Миграция добавляет таблицы личного кабинета (users) и журнала действий
(action_logs). См. backend/models.py — единственный источник структуры.

Revision ID: 0002
Revises: 0001
Create Date: 2026-01-02 00:00:00

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=160), server_default=sa.text("''"), nullable=False),
        sa.Column("role", sa.String(length=20), server_default=sa.text("'user'"), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'active'"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("idx_users_email", "users", ["email"])

    op.create_table(
        "action_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("details", sa.Text(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_action_logs_user_created", "action_logs", ["user_id", sa.text("created_at DESC")])
    op.create_index("idx_action_logs_action", "action_logs", ["action"])


def downgrade() -> None:
    op.drop_index("idx_action_logs_action", table_name="action_logs")
    op.drop_index("idx_action_logs_user_created", table_name="action_logs")
    op.drop_table("action_logs")
    op.drop_index("idx_users_email", table_name="users")
    op.drop_table("users")
