"""add_stress_sessions

Revision ID: a1b2c3d4e5f6
Revises: 3eed8d41b37b
Create Date: 2026-05-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "3eed8d41b37b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stress_sessions",
        sa.Column("object_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("equipment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["object_id"], ["objects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("object_id"),
    )


def downgrade() -> None:
    op.drop_table("stress_sessions")
