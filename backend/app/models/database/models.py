import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DDL, Float, ForeignKey, String, event, func
from sqlalchemy.dialects.postgresql import ENUM, JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# === ENUMS ===

class ObjectType(str, enum.Enum):
    DATACENTER = "datacenter"
    WORKSHOP = "workshop"
    BUILDING = "building"


class SensorType(str, enum.Enum):
    ELECTRICITY = "electricity"


class SensorCategory(str, enum.Enum):
    SERVERS = "servers"
    COOLING = "cooling"
    UPS = "ups"
    LIGHTING = "lighting"


class SeverityLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

# === MODELS ===


class Object(Base):
    __tablename__ = "objects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[ObjectType] = mapped_column(
        ENUM(ObjectType, name="object_type_enum", create_type=True),
        nullable=False
    )
    meta_data: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=True
    )

    sensors: Mapped[list["Sensor"]] = relationship(
        "Sensor",
        back_populates="object",
        cascade="all, delete-orphan"
    )


class Anomaly(Base):
    __tablename__ = "anomalies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid()
    )

    sensor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sensors.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    detected_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        index=True
    )

    severity: Mapped[SeverityLevel] = mapped_column(
        ENUM(SeverityLevel, name="severity_level_enum", create_type=True),
        nullable=False
    )

    value: Mapped[float] = mapped_column(Float, nullable=False)
    expected_value: Mapped[float] = mapped_column(Float, nullable=True)

    sensor: Mapped["Sensor"] = relationship("Sensor",
                                            back_populates="anomalies")

    def __repr__(self) -> str:
        return f"<Anomaly(id={self.id},"\
            "sensor={self.sensor_id}, severity='{self.severity}')>"


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    object_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("objects.id", ondelete="CASCADE"),
        nullable=False
    )
    type: Mapped[SensorType] = mapped_column(
        ENUM(SensorType, name="sensor_type_enum", create_type=True),
        nullable=False
    )
    category: Mapped[SensorCategory] = mapped_column(
        ENUM(
            SensorCategory,
            name="sensor_category_enum",
            create_type=True
        ),
        nullable=False
    )
    unit: Mapped[str] = mapped_column(
        String,
        default="кВт/ч",
        server_default="кВт/ч",
        nullable=False
    )

    object: Mapped["Object"] = relationship("Object", back_populates="sensors")
    readings: Mapped[list["Reading"]] = relationship(
        "Reading",
        back_populates="sensor",
        cascade="all, delete-orphan"
    )
    anomalies: Mapped[list["Anomaly"]] = relationship(
        "Anomaly",
        back_populates="sensor",
        cascade="all, delete-orphan"
    )


class Reading(Base):
    __tablename__ = "readings"

    time: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        primary_key=True,
        default=func.now()
    )
    sensor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sensors.id", ondelete="CASCADE"),
        primary_key=True
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)

    sensor: Mapped["Sensor"] = relationship("Sensor",
                                            back_populates="readings")


# === TimescaleDB Hypertable Setup ===

HYPERTABLE_SQL = (
    "SELECT create_hypertable('readings', by_range('time'), "
    "if_not_exists => TRUE);"
)

event.listen(
    Reading.__table__,
    "after_create",
    DDL(HYPERTABLE_SQL)
)
