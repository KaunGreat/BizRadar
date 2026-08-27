"""initial schema — все таблицы BizRadar

Первичная миграция: воспроизводит схемы, которые раньше создавались вручную
в database.py (SQLite). Теперь это единственный источник структуры БД —
одинаково для PostgreSQL (прод) и SQLite (локальная разработка).

Revision ID: 0001
Revises:
Create Date: 2026-01-01 00:00:00

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "market_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("niche_id", sa.String(), nullable=False),
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("ttl_days", sa.Integer(), server_default=sa.text("7"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "report_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("niche", sa.String(), nullable=False),
        sa.Column("region", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "region_stats",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("region_key", sa.String(), nullable=False),
        sa.Column("region_name", sa.String(), nullable=False),
        sa.Column("level", sa.String(), nullable=False),
        sa.Column("subject_key", sa.String(), nullable=True),
        sa.Column("population", sa.Integer(), nullable=True),
        sa.Column("avg_income", sa.Float(), nullable=True),
        sa.Column("extras", sa.Text(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("as_of", sa.String(), nullable=True),
        sa.Column("source", sa.String(), server_default=sa.text("'static-fallback'"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("region_key"),
    )

    op.create_table(
        "location_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("niche_id", sa.String(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("ttl_days", sa.Integer(), server_default=sa.text("7"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_location_snapshots_city_niche", "location_snapshots", ["city", "niche_id"])

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("niche_id", sa.String(), nullable=False),
        sa.Column("niche_title", sa.String(), nullable=False),
        sa.Column("city", sa.String(), server_default=sa.text("''"), nullable=False),
        sa.Column("city_name", sa.String(), server_default=sa.text("''"), nullable=False),
        sa.Column("score", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("survival", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("has_report", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("snapshot", sa.Text(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_projects_created", "projects", [sa.text("created_at DESC")])


def downgrade() -> None:
    op.drop_index("idx_projects_created", table_name="projects")
    op.drop_table("projects")
    op.drop_index("idx_location_snapshots_city_niche", table_name="location_snapshots")
    op.drop_table("location_snapshots")
    op.drop_table("region_stats")
    op.drop_table("report_requests")
    op.drop_table("market_snapshots")
