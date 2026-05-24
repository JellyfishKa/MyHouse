"""add_equipment_readings_alerts

Revision ID: 3eed8d41b37b
Revises: cb7d6f8c6e11
Create Date: 2026-05-21 15:15:34.344992

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '3eed8d41b37b'
down_revision: Union[str, Sequence[str], None] = 'cb7d6f8c6e11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types safely (severity_level_enum already exists from init migration)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE severity_level_enum AS ENUM ('low', 'medium', 'high', 'critical');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE equipment_type_enum AS ENUM ('server', 'conditioner', 'ups', 'switch');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE equipment_status_enum AS ENUM ('online', 'offline', 'maintenance');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.create_table(
        'equipment',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('object_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', postgresql.ENUM('server', 'conditioner', 'ups', 'switch',
                                          name='equipment_type_enum', create_type=False), nullable=False),
        sa.Column('status', postgresql.ENUM('online', 'offline', 'maintenance',
                                            name='equipment_status_enum', create_type=False),
                  server_default='online', nullable=False),
        sa.Column('installed_at', postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('meta_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['object_id'], ['objects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_equipment_object_id'), 'equipment', ['object_id'], unique=False)

    op.create_table(
        'alerts',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('equipment_id', sa.UUID(), nullable=False),
        sa.Column('severity', postgresql.ENUM('low', 'medium', 'high', 'critical',
                                               name='severity_level_enum', create_type=False), nullable=False),
        sa.Column('message', sa.String(), nullable=False),
        sa.Column('triggered_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('acknowledged', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_alerts_equipment_id'), 'alerts', ['equipment_id'], unique=False)
    op.create_index(op.f('ix_alerts_triggered_at'), 'alerts', ['triggered_at'], unique=False)

    # anomalies was created in init migration without indexes/defaults — drop and recreate
    op.drop_table('anomalies')

    op.create_table(
        'anomalies',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('sensor_id', sa.UUID(), nullable=False),
        sa.Column('detected_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('severity', postgresql.ENUM('low', 'medium', 'high', 'critical',
                                               name='severity_level_enum', create_type=False), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('expected_value', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['sensor_id'], ['sensors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_anomalies_detected_at'), 'anomalies', ['detected_at'], unique=False)
    op.create_index(op.f('ix_anomalies_sensor_id'), 'anomalies', ['sensor_id'], unique=False)

    op.create_table(
        'equipment_readings',
        sa.Column('time', postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('equipment_id', sa.UUID(), nullable=False),
        sa.Column('current_a', sa.Float(), nullable=True),
        sa.Column('voltage_v', sa.Float(), nullable=True),
        sa.Column('power_kw', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('time', 'equipment_id'),
    )

    # Create TimescaleDB hypertable for equipment_readings
    op.execute("SELECT create_hypertable('equipment_readings', by_range('time'), if_not_exists => TRUE)")


def downgrade() -> None:
    op.drop_table('equipment_readings')
    op.drop_index(op.f('ix_anomalies_sensor_id'), table_name='anomalies')
    op.drop_index(op.f('ix_anomalies_detected_at'), table_name='anomalies')
    op.drop_table('anomalies')
    op.drop_index(op.f('ix_alerts_triggered_at'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_equipment_id'), table_name='alerts')
    op.drop_table('alerts')
    op.drop_index(op.f('ix_equipment_object_id'), table_name='equipment')
    op.drop_table('equipment')
    op.execute("DROP TYPE IF EXISTS equipment_status_enum")
    op.execute("DROP TYPE IF EXISTS equipment_type_enum")
    op.execute("DROP TYPE IF EXISTS severity_level_enum")
