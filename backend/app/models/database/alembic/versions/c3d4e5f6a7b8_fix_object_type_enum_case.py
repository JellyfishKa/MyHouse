"""fix object_type_enum uppercase to lowercase

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-05 06:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'DATACENTER'
                  AND enumtypid = 'object_type_enum'::regtype
            ) THEN
                ALTER TYPE object_type_enum RENAME VALUE 'DATACENTER' TO 'datacenter';
            END IF;
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'WORKSHOP'
                  AND enumtypid = 'object_type_enum'::regtype
            ) THEN
                ALTER TYPE object_type_enum RENAME VALUE 'WORKSHOP' TO 'workshop';
            END IF;
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'BUILDING'
                  AND enumtypid = 'object_type_enum'::regtype
            ) THEN
                ALTER TYPE object_type_enum RENAME VALUE 'BUILDING' TO 'building';
            END IF;
        END$$;
    """)


def downgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'datacenter'
                  AND enumtypid = 'object_type_enum'::regtype
            ) THEN
                ALTER TYPE object_type_enum RENAME VALUE 'datacenter' TO 'DATACENTER';
            END IF;
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'workshop'
                  AND enumtypid = 'object_type_enum'::regtype
            ) THEN
                ALTER TYPE object_type_enum RENAME VALUE 'workshop' TO 'WORKSHOP';
            END IF;
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'building'
                  AND enumtypid = 'object_type_enum'::regtype
            ) THEN
                ALTER TYPE object_type_enum RENAME VALUE 'building' TO 'BUILDING';
            END IF;
        END$$;
    """)
