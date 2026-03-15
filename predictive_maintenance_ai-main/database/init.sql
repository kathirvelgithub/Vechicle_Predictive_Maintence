-- ============================================
-- Predictive Maintenance Database Schema
-- PostgreSQL Initialization Script
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. VEHICLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id VARCHAR(50) UNIQUE NOT NULL,
    vin VARCHAR(17) UNIQUE,
    make VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    vehicle_type VARCHAR(50), -- sedan, suv, truck, sportsCar, electricVehicle
    registration_number VARCHAR(50),
    
    -- Owner Information
    owner_name VARCHAR(200),
    owner_email VARCHAR(255),
    owner_phone VARCHAR(20),
    
    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, maintenance, inactive
    last_service_date TIMESTAMP,
    next_service_date TIMESTAMP,
    odometer_km DECIMAL(10, 2) DEFAULT 0,
    
    -- AI Analysis Results (Latest)
    last_risk_score INTEGER DEFAULT 0,
    last_risk_level VARCHAR(20) DEFAULT 'LOW', -- LOW, MEDIUM, HIGH, CRITICAL
    last_analysis_timestamp TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. TELEMATICS LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS telematics_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id VARCHAR(50) NOT NULL,
    timestamp_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Core Metrics
    speed_kmh DECIMAL(5, 2),
    rpm INTEGER,
    engine_temp_c DECIMAL(5, 2),
    oil_pressure_psi DECIMAL(5, 2),
    coolant_temp_c DECIMAL(5, 2),
    fuel_level_percent DECIMAL(5, 2),
    battery_voltage DECIMAL(4, 2),
    
    -- Location
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    altitude_m DECIMAL(7, 2),
    heading_degrees DECIMAL(5, 2),
    
    -- Advanced Metrics
    engine_torque_nm DECIMAL(7, 2),
    engine_power_kw DECIMAL(7, 2),
    throttle_position_percent DECIMAL(5, 2),
    brake_pressure_psi DECIMAL(6, 2),
    
    -- Component Health (0-100%)
    engine_health DECIMAL(5, 2),
    transmission_health DECIMAL(5, 2),
    brake_health DECIMAL(5, 2),
    tire_health DECIMAL(5, 2),
    battery_health DECIMAL(5, 2),
    cooling_system_health DECIMAL(5, 2),
    exhaust_system_health DECIMAL(5, 2),
    suspension_health DECIMAL(5, 2),
    
    -- Diagnostics
    active_dtc_codes TEXT[], -- Array of fault codes
    dtc_readable TEXT,
    vibration_level VARCHAR(20),
    noise_level VARCHAR(20),
    
    -- Cumulative Stats
    total_distance_km DECIMAL(10, 2),
    total_fuel_used_l DECIMAL(10, 2),
    total_operating_hours DECIMAL(10, 2),
    
    -- AI Analysis
    risk_score INTEGER,
    anomaly_detected BOOLEAN DEFAULT false,
    
    -- Full AI Result (JSON dump)
    raw_payload JSONB,
    
    -- Indexes
    CONSTRAINT fk_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
);

-- ============================================
-- 2B. VEHICLE LIVE STATE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS vehicle_live_state (
    vehicle_id VARCHAR(50) PRIMARY KEY,
    timestamp_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Latest Core Metrics
    speed_kmh DECIMAL(5, 2),
    rpm INTEGER,
    engine_temp_c DECIMAL(5, 2),
    oil_pressure_psi DECIMAL(5, 2),
    fuel_level_percent DECIMAL(5, 2),
    battery_voltage DECIMAL(4, 2),
    active_dtc_codes TEXT[],

    -- Latest AI Flags
    risk_score INTEGER DEFAULT 0,
    risk_level VARCHAR(20) DEFAULT 'LOW',
    anomaly_level VARCHAR(20) DEFAULT 'NORMAL',
    anomaly_detected BOOLEAN DEFAULT false,
    last_reasons TEXT[],

    raw_payload JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_live_state_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
);

-- ============================================
-- 2C. ANOMALY EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS anomaly_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id VARCHAR(50) NOT NULL,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    anomaly_level VARCHAR(20) NOT NULL, -- WATCH, HIGH, CRITICAL
    risk_score INTEGER,
    risk_level VARCHAR(20),
    reasons TEXT[],
    telematics_snapshot JSONB,

    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_anomaly_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
);

-- ============================================
-- 2D. TELEMETRY MINUTE AGGREGATES TABLE
-- ============================================
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

-- ============================================
-- 3. AI ANALYSIS RESULTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_analysis_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id VARCHAR(50) NOT NULL,
    analysis_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Risk Analysis
    risk_score INTEGER NOT NULL,
    risk_level VARCHAR(20) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    detected_issues TEXT[],
    
    -- Diagnosis
    diagnosis_report TEXT,
    recommended_action TEXT,
    priority_level VARCHAR(20), -- Low, Medium, High, Critical
    
    -- Customer Engagement
    customer_script TEXT,
    customer_decision VARCHAR(20), -- BOOKED, DEFERRED, REJECTED, PENDING
    
    -- Scheduling
    booking_id VARCHAR(50),
    selected_slot TIMESTAMP,
    scheduled_date TIMESTAMP,
    
    -- Manufacturing Insights
    manufacturing_recommendations TEXT,
    feedback_request TEXT,
    
    -- UEBA Security
    ueba_alert_triggered BOOLEAN DEFAULT false,
    ueba_alert_details TEXT,
    
    -- Audio
    audio_url TEXT,
    audio_available BOOLEAN DEFAULT false,
    
    -- Metadata
    processing_time_ms INTEGER,
    error_message TEXT,
    
    CONSTRAINT fk_ai_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
);

-- ============================================
-- 4. SERVICE BOOKINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS service_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id VARCHAR(50) UNIQUE NOT NULL,
    vehicle_id VARCHAR(50) NOT NULL,
    
    -- Booking Details
    scheduled_date TIMESTAMP NOT NULL,
    service_type VARCHAR(100), -- routine, repair, critical
    estimated_duration_hours DECIMAL(4, 2),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, in_progress, completed, cancelled
    priority VARCHAR(20), -- routine, urgent, critical
    
    -- Service Details
    issues_to_address TEXT[],
    recommended_parts TEXT[],
    estimated_cost DECIMAL(10, 2),
    
    -- Completion
    actual_start_time TIMESTAMP,
    actual_end_time TIMESTAMP,
    work_completed TEXT,
    parts_replaced TEXT[],
    final_cost DECIMAL(10, 2),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_booking_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
);

-- ============================================
-- 5. NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id VARCHAR(50) NOT NULL,
    
    -- Notification Details
    notification_type VARCHAR(50), -- alert, reminder, info, critical
    title VARCHAR(200),
    message TEXT,
    
    -- Delivery
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    channel VARCHAR(50), -- email, sms, push, voice
    recipient VARCHAR(255),
    
    -- Status
    read BOOLEAN DEFAULT false,
    acknowledged BOOLEAN DEFAULT false,
    
    CONSTRAINT fk_notification_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
);

-- ============================================
-- 6. UEBA SECURITY LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ueba_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Event Details
    event_type VARCHAR(100), -- anomaly_telemetry, unauthorized_access, suspicious_pattern
    severity VARCHAR(20), -- low, medium, high, critical
    
    -- Context
    vehicle_id VARCHAR(50),
    user_id VARCHAR(100),
    ip_address VARCHAR(45),
    
    -- Details
    description TEXT,
    raw_data JSONB,
    
    -- Response
    action_taken TEXT,
    resolved BOOLEAN DEFAULT false
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Vehicles
CREATE INDEX idx_vehicles_vehicle_id ON vehicles(vehicle_id);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_risk_level ON vehicles(last_risk_level);

-- Telematics Logs
CREATE INDEX idx_telematics_vehicle_id ON telematics_logs(vehicle_id);
CREATE INDEX idx_telematics_timestamp ON telematics_logs(timestamp_utc DESC);
CREATE INDEX idx_telematics_vehicle_time ON telematics_logs(vehicle_id, timestamp_utc DESC);
CREATE INDEX idx_telematics_anomaly ON telematics_logs(anomaly_detected) WHERE anomaly_detected = true;

-- Vehicle Live State
CREATE INDEX idx_live_state_risk_level ON vehicle_live_state(risk_level);
CREATE INDEX idx_live_state_updated_at ON vehicle_live_state(updated_at DESC);

-- Anomaly Events
CREATE INDEX idx_anomaly_events_vehicle_time ON anomaly_events(vehicle_id, event_timestamp DESC);
CREATE INDEX idx_anomaly_events_level ON anomaly_events(anomaly_level);
CREATE INDEX idx_anomaly_events_unresolved ON anomaly_events(resolved) WHERE resolved = false;

-- Telemetry Aggregates
CREATE INDEX idx_telemetry_agg_vehicle_bucket ON telemetry_minute_aggregates(vehicle_id, bucket_minute DESC);

-- AI Analysis Results
CREATE INDEX idx_analysis_vehicle_id ON ai_analysis_results(vehicle_id);
CREATE INDEX idx_analysis_timestamp ON ai_analysis_results(analysis_timestamp DESC);
CREATE INDEX idx_analysis_risk_level ON ai_analysis_results(risk_level);
CREATE INDEX idx_analysis_ueba ON ai_analysis_results(ueba_alert_triggered) WHERE ueba_alert_triggered = true;

-- Service Bookings
CREATE INDEX idx_bookings_vehicle_id ON service_bookings(vehicle_id);
CREATE INDEX idx_bookings_status ON service_bookings(status);
CREATE INDEX idx_bookings_scheduled_date ON service_bookings(scheduled_date);

-- Notifications
CREATE INDEX idx_notifications_vehicle_id ON notifications(vehicle_id);
CREATE INDEX idx_notifications_unread ON notifications(read) WHERE read = false;

-- UEBA Logs
CREATE INDEX idx_ueba_timestamp ON ueba_logs(timestamp DESC);
CREATE INDEX idx_ueba_severity ON ueba_logs(severity);
CREATE INDEX idx_ueba_vehicle_id ON ueba_logs(vehicle_id);

-- ============================================
-- SAMPLE DATA INSERT
-- ============================================

-- Insert sample vehicles
INSERT INTO vehicles (vehicle_id, vin, make, model, year, vehicle_type, owner_name, owner_email, status) VALUES
('V-301', 'MA1234567890ABCDE', 'Mahindra', 'XUV 3XO', 2024, 'suv', 'Rajesh Kumar', 'rajesh@example.com', 'active'),
('V-302', 'MA2234567890ABCDE', 'Mahindra', 'Thar', 2024, 'suv', 'Priya Singh', 'priya@example.com', 'active'),
('V-303', 'MA3234567890ABCDE', 'Mahindra', 'Scorpio N', 2024, 'suv', 'Amit Patel', 'amit@example.com', 'active'),
('V-304', 'MA4234567890ABCDE', 'Mahindra', 'XUV700', 2024, 'suv', 'Sneha Reddy', 'sneha@example.com', 'active'),
('V-401', 'HO1234567890ABCDE', 'Honda', 'City', 2024, 'sedan', 'Vikram Mehta', 'vikram@example.com', 'active'),
('V-402', 'HO2234567890ABCDE', 'Honda', 'Elevate', 2024, 'suv', 'Anita Sharma', 'anita@example.com', 'active'),
('V-403', 'HO3234567890ABCDE', 'Honda', 'City Hybrid eHEV', 2024, 'sedan', 'Ravi Krishnan', 'ravi@example.com', 'active')
ON CONFLICT (vehicle_id) DO NOTHING;

-- ============================================
-- TRIGGERS FOR AUTO-UPDATE
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON service_bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_live_state_updated_at BEFORE UPDATE ON vehicle_live_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Vehicle Health Overview
CREATE OR REPLACE VIEW vehicle_health_overview AS
SELECT 
    v.vehicle_id,
    v.make,
    v.model,
    v.owner_name,
    v.last_risk_score,
    v.last_risk_level,
    v.status,
    t.engine_health,
    t.transmission_health,
    t.brake_health,
    t.battery_health,
    t.timestamp_utc as last_telemetry
FROM vehicles v
LEFT JOIN LATERAL (
    SELECT * FROM telematics_logs
    WHERE vehicle_id = v.vehicle_id
    ORDER BY timestamp_utc DESC
    LIMIT 1
) t ON true;

-- Recent Alerts
CREATE OR REPLACE VIEW recent_critical_alerts AS
SELECT 
    a.vehicle_id,
    v.make,
    v.model,
    a.risk_level,
    a.detected_issues,
    a.diagnosis_report,
    a.analysis_timestamp
FROM ai_analysis_results a
JOIN vehicles v ON a.vehicle_id = v.vehicle_id
WHERE a.risk_level IN ('HIGH', 'CRITICAL')
ORDER BY a.analysis_timestamp DESC;

COMMENT ON DATABASE predictive_maintenance IS 'Predictive Maintenance AI Platform - Production Database';
