"""fix sensor_type_enum and sensor_category_enum uppercase to lowercase

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-05 06:30:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _rename_if_exists(enum_name: str, old_val: str, new_val: str) -> str:
    return f"""
        IF EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = '{old_val}'
              AND enumtypid = '{enum_name}'::regtype
        ) THEN
            ALTER TYPE {enum_name} RENAME VALUE '{old_val}' TO '{new_val}';
        END IF;"""


def upgrade() -> None:
    op.execute(f"""
        DO $$
        BEGIN
            {_rename_if_exists('sensor_type_enum', 'ELECTRICITY', 'electricity')}
            {_rename_if_exists('sensor_category_enum', 'SERVERS', 'servers')}
            {_rename_if_exists('sensor_category_enum', 'COOLING', 'cooling')}
            {_rename_if_exists('sensor_category_enum', 'UPS', 'ups')}
            {_rename_if_exists('sensor_category_enum', 'LIGHTING', 'lighting')}
            {_rename_if_exists('severity_level_enum', 'LOW', 'low')}
            {_rename_if_exists('severity_level_enum', 'MEDIUM', 'medium')}
            {_rename_if_exists('severity_level_enum', 'HIGH', 'high')}
            {_rename_if_exists('severity_level_enum', 'CRITICAL', 'critical')}
        END$$;
    """)


def downgrade() -> None:
    op.execute(f"""
        DO $$
        BEGIN
            {_rename_if_exists('sensor_type_enum', 'electricity', 'ELECTRICITY')}
            {_rename_if_exists('sensor_category_enum', 'servers', 'SERVERS')}
            {_rename_if_exists('sensor_category_enum', 'cooling', 'COOLING')}
            {_rename_if_exists('sensor_category_enum', 'ups', 'UPS')}
            {_rename_if_exists('sensor_category_enum', 'lighting', 'LIGHTING')}
            {_rename_if_exists('severity_level_enum', 'low', 'LOW')}
            {_rename_if_exists('severity_level_enum', 'medium', 'MEDIUM')}
            {_rename_if_exists('severity_level_enum', 'high', 'HIGH')}
            {_rename_if_exists('severity_level_enum', 'critical', 'CRITICAL')}
        END$$;
    """)
