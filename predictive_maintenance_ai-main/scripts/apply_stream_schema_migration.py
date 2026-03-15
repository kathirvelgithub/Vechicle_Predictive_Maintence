"""Apply idempotent schema changes required for stream-first telemetry tables.

This migration is safe to run multiple times.
"""

from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from database import get_connection


DDL_STATEMENTS = [
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
    """
    CREATE TABLE IF NOT EXISTS vehicle_live_state (
        vehicle_id VARCHAR(50) PRIMARY KEY,
        timestamp_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        speed_kmh DECIMAL(5, 2),
        rpm INTEGER,
        engine_temp_c DECIMAL(5, 2),
        oil_pressure_psi DECIMAL(5, 2),
        fuel_level_percent DECIMAL(5, 2),
        battery_voltage DECIMAL(4, 2),
        active_dtc_codes TEXT[],
        risk_score INTEGER DEFAULT 0,
        risk_level VARCHAR(20) DEFAULT 'LOW',
        anomaly_level VARCHAR(20) DEFAULT 'NORMAL',
        anomaly_detected BOOLEAN DEFAULT false,
        last_reasons TEXT[],
        raw_payload JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_live_state_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS anomaly_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        vehicle_id VARCHAR(50) NOT NULL,
        event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        anomaly_level VARCHAR(20) NOT NULL,
        risk_score INTEGER,
        risk_level VARCHAR(20),
        reasons TEXT[],
        telematics_snapshot JSONB,
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_anomaly_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS telemetry_minute_aggregates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        vehicle_id VARCHAR(50) NOT NULL,
        bucket_minute TIMESTAMP NOT NULL,
        samples_count INTEGER DEFAULT 0,
        avg_engine_temp_c DECIMAL(5, 2),
        max_engine_temp_c DECIMAL(5, 2),
        min_oil_pressure_psi DECIMAL(5, 2),
        avg_rpm DECIMAL(8, 2),
        avg_battery_voltage DECIMAL(6, 3),
        risk_score_max INTEGER,
        anomaly_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_telemetry_minute UNIQUE (vehicle_id, bucket_minute),
        CONSTRAINT fk_aggregate_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
    );
    """,
    'CREATE INDEX IF NOT EXISTS idx_live_state_risk_level ON vehicle_live_state(risk_level);',
    'CREATE INDEX IF NOT EXISTS idx_live_state_updated_at ON vehicle_live_state(updated_at DESC);',
    'CREATE INDEX IF NOT EXISTS idx_anomaly_events_vehicle_time ON anomaly_events(vehicle_id, event_timestamp DESC);',
    'CREATE INDEX IF NOT EXISTS idx_anomaly_events_level ON anomaly_events(anomaly_level);',
    'CREATE INDEX IF NOT EXISTS idx_anomaly_events_unresolved ON anomaly_events(resolved) WHERE resolved = false;',
    'CREATE INDEX IF NOT EXISTS idx_telemetry_agg_vehicle_bucket ON telemetry_minute_aggregates(vehicle_id, bucket_minute DESC);',
    """
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';
    """,
    'DROP TRIGGER IF EXISTS update_live_state_updated_at ON vehicle_live_state;',
    """
    CREATE TRIGGER update_live_state_updated_at
    BEFORE UPDATE ON vehicle_live_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """,
]


def verify_tables(cursor) -> None:
    cursor.execute(
        """
        SELECT
            to_regclass('public.vehicle_live_state') AS live_state,
            to_regclass('public.anomaly_events') AS anomaly_events,
            to_regclass('public.telemetry_minute_aggregates') AS minute_aggregates;
        """
    )
    row = cursor.fetchone()
    print("[verify] vehicle_live_state:", row[0])
    print("[verify] anomaly_events:", row[1])
    print("[verify] telemetry_minute_aggregates:", row[2])


def main() -> None:
    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cursor:
                for statement in DDL_STATEMENTS:
                    cursor.execute(statement)
                verify_tables(cursor)
        print("[ok] Stream schema migration applied successfully.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
