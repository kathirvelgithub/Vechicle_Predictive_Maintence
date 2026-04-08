export interface OwnerInfo {
  full_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
}

export interface VehicleSummary {
  vin: string;
  model: string;
  location: string;
  telematics: string;
  predictedFailure: string;
  probability: number;
  action: string;
  scheduled_date?: string | null;
  engine_temp?: number;
  oil_pressure?: number;
  battery_voltage?: number;
  diagnosis_source?: string | null;
  fallback_reason?: string | null;
  owners?: OwnerInfo | null;
}

export interface BookingRecord {
  booking_id: string;
  vehicle_id: string;
  scheduled_date: string;
  status?: string;
  priority?: string;
  service_type?: string;
  estimated_duration_hours?: number;
}

export interface SchedulingRecommendation {
  recommendation_id: string;
  vehicle_id: string;
  recommended_start: string;
  estimated_duration_hours: number;
  service_type?: string;
  priority?: string;
  risk_score?: number;
  reason?: string;
  status: string;
  recipient?: string;
  suggested_by?: string;
  approver_email?: string;
  approved_at?: string;
  rejected_at?: string;
  booking_id?: string;
  customer_confirmation_status?: string;
  customer_confirmation_method?: string;
  customer_confirmation_email?: string;
  customer_confirmation_phone?: string;
  customer_confirmation_requested_at?: string;
  customer_confirmation_confirmed_at?: string;
  customer_confirmation_declined_at?: string;
  customer_confirmation_reference?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SchedulingDecisionResult {
  status: string;
  recommendation: SchedulingRecommendation;
  message?: string;
  booking_id?: string;
  alternative_start?: string;
}

export interface NotificationItem {
  id?: string;
  vehicle_id: string;
  notification_type?: string;
  title?: string;
  message?: string;
  sent_at?: string;
  channel?: string;
  recipient?: string;
  read?: boolean;
  acknowledged?: boolean;
}

export interface ReadinessStatus {
  ready?: boolean;
  checked_at?: string;
  blockers?: string[];
  warnings?: string[];
}
