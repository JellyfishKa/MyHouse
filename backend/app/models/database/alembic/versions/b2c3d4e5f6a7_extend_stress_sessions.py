"""extend_stress_sessions

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-26 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stress_sessions",
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "stress_sessions",
        sa.Column("duration_seconds", sa.Integer(), nullable=True, server_default="180"),
    )
    op.add_column(
        "stress_sessions",
        sa.Column("cancelled_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stress_sessions", "cancelled_at")
    op.drop_column("stress_sessions", "duration_seconds")
    op.drop_column("stress_sessions", "started_at")
