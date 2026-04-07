"""add sensor label

Revision ID: cb7d6f8c6e11
Revises: 4e1add1cfd5d
Create Date: 2026-04-07 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "cb7d6f8c6e11"
down_revision: Union[str, Sequence[str], None] = "4e1add1cfd5d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sensors", sa.Column("label", sa.String(), nullable=True))
    op.execute(
        """
        UPDATE sensors
        SET label = CASE category::text
            WHEN 'servers' THEN 'Серверы'
            WHEN 'cooling' THEN 'Охлаждение'
            WHEN 'ups' THEN 'ИБП'
            WHEN 'lighting' THEN 'Освещение'
            ELSE 'Sensor'
        END
        WHERE label IS NULL
        """
    )
    op.alter_column("sensors", "label", existing_type=sa.String(), nullable=False)


def downgrade() -> None:
    op.drop_column("sensors", "label")
