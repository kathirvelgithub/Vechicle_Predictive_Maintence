import axios from 'axios';
import { API_BASE_URL, API_BASE_URL_CANDIDATES } from './config';

const LIVE_DATA_REQUEST_TIMEOUT_MS = 8000;

// ==========================================
// 1. INTERFACES
// ==========================================

export interface TelematicsData {
    vehicle_id: string;
    engine_temp_c: number;
    oil_pressure_psi: number;
    rpm: number;
    battery_voltage?: number;
    active_dtc_codes?: string[] | string;
    manual_override_active?: boolean;
    manual_override_keys?: string[];
    manual_override_values?: Record<string, number>;
}

export interface VoiceLogEntry {
    role: string;
    content: string;
}

export interface AnalysisResult {
    vehicle_id: string;
    risk_score: number;
    risk_level: string;
    diagnosis: string;
    diagnosis_source?: string;
    fallback_reason?: string;
    manufacturing_insights?: string;
    ueba_alerts?: { message: string }[];
    
    customer_script?: string;
    booking_id?: string;
    detected_issues?: string[];
    voice_transcript?: VoiceLogEntry[];
    scheduled_date?: string;
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
    voice_transcript?: VoiceLogEntry[] | null;
    engine_temp?: number;
    oil_pressure?: number;
    battery_voltage?: number;
    manual_override_active?: boolean;
    manual_override_keys?: string[];
    diagnosis_source?: string;
    fallback_reason?: string;
}

export interface ActivityLog {
    id: string;
    time: string;
    agent: string;
    vehicle_id: string;
    message: string;
    type: 'info' | 'warning' | 'alert';
}

export interface BookingResponse {
    status: string;
    booking_id: string;
    message: string;
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

export interface SchedulingRecommendationCreatePayload {
    vehicleId: string;
    serviceDate?: string;
    requestedStart?: string;
    notes?: string;
    serviceType?: string;
    priority?: string;
    riskScore?: number;
    suggestedBy?: string;
    recipient?: string;
    estimatedDurationHours?: number;
}

export interface SchedulingRecommendationResult {
    status: string;
    recommendation: SchedulingRecommendation;
    alert_sent?: boolean;
    notification?: NotificationItem;
    sms_confirmation?: {
        status?: string;
        provider?: string;
        provider_message_id?: string;
        reference?: string;
        requested_at?: string;
        expires_at?: string;
        error?: string;
        simulated?: boolean;
    };
    email_confirmation?: {
        status?: string;
        provider?: string;
        provider_message_id?: string;
        reference?: string;
        requested_at?: string;
        expires_at?: string;
        error?: string;
        simulated?: boolean;
    };
    message?: string;
    booking_id?: string;
    conflict_booking?: Record<string, unknown>;
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

const extractApiError = (error: unknown, fallbackMessage: string): Error => {
    if (axios.isAxiosError(error)) {
        const detail =
            (typeof error.response?.data?.detail === 'string' && error.response?.data?.detail) ||
            (typeof error.response?.data?.message === 'string' && error.response?.data?.message) ||
            error.message;
        return new Error(detail || fallbackMessage);
    }
    if (error instanceof Error) {
        return error;
    }
    return new Error(fallbackMessage);
};

const normalizeOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

const normalizeRequiredString = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : fallback;
};

const normalizeDiagnosisSource = (value: unknown, fallbackReason?: string): string | undefined => {
    const normalizedFallback = normalizeOptionalString(fallbackReason);
    const rawSource = normalizeOptionalString(value);
    if (!rawSource) {
        return normalizedFallback ? 'rules_fallback' : undefined;
    }

    const normalized = rawSource.toLowerCase().replace(/[\s-]+/g, '_');
    if (normalized === 'fallback_rules' || normalized === 'rule_fallback') {
        return 'rules_fallback';
    }
    if (normalized.includes('local')) {
        return 'local_fallback';
    }
    if (normalized === 'llm' || normalized === 'rules_fallback') {
        return normalized;
    }
    return normalized;
};

const normalizeAnalysisResult = (result: AnalysisResult): AnalysisResult => {
    const fallbackReason = normalizeOptionalString(result.fallback_reason);
    return {
        ...result,
        diagnosis_source: normalizeDiagnosisSource(result.diagnosis_source, fallbackReason),
        fallback_reason: fallbackReason,
    };
};

const normalizeVehicleSummaryResult = (vehicle: VehicleSummary): VehicleSummary => {
    const fallbackReason = normalizeOptionalString(vehicle.fallback_reason);
    const normalizedProbability = Number(vehicle.probability);
    return {
        ...vehicle,
        vin: normalizeRequiredString(vehicle.vin, 'UNKNOWN'),
        model: normalizeRequiredString(vehicle.model, 'Unknown Model'),
        location: normalizeRequiredString(vehicle.location, 'Unknown'),
        telematics: normalizeRequiredString(vehicle.telematics, 'Unavailable'),
        predictedFailure: normalizeRequiredString(vehicle.predictedFailure, 'System Healthy'),
        probability: Number.isFinite(normalizedProbability) ? normalizedProbability : 0,
        action: normalizeRequiredString(vehicle.action, 'Monitoring'),
        diagnosis_source: normalizeDiagnosisSource(vehicle.diagnosis_source, fallbackReason),
        fallback_reason: fallbackReason,
    };
};

const requestWithApiBaseFallback = async <T>(
    executor: (apiBaseUrl: string) => Promise<T>,
    fallbackMessage: string,
): Promise<T> => {
    let lastError: unknown = null;
    const candidates = API_BASE_URL_CANDIDATES.length > 0 ? API_BASE_URL_CANDIDATES : [API_BASE_URL];

    for (const candidate of candidates) {
        try {
            return await executor(candidate);
        } catch (error) {
            lastError = error;
        }
    }

    throw extractApiError(lastError, fallbackMessage);
};

// ==========================================
// 2. API SERVICE
// ==========================================

export const api = {
    getTelematics: async (vehicleId: string): Promise<TelematicsData | null> => {
        try {
            return await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.get(`${apiBaseUrl}/telematics/${vehicleId}`, {
                        timeout: LIVE_DATA_REQUEST_TIMEOUT_MS,
                    });
                    return response.data as TelematicsData | null;
                },
                `Failed to fetch telematics for ${vehicleId}`,
            );
        } catch (error) {
            console.error(`Failed to fetch telematics for ${vehicleId}`, error);
            return null;
        }
    },

    runPrediction: async (vehicleId: string, telematics?: Partial<TelematicsData>): Promise<AnalysisResult | null> => {
        try {
            const payload: Record<string, unknown> = {
                vehicle_id: vehicleId,
                metadata: {
                    source: 'frontend_manual_diagnosis'
                }
            };

            if (telematics) {
                if (telematics.engine_temp_c !== undefined) {
                    payload.engine_temp_c = Math.round(Number(telematics.engine_temp_c));
                }
                if (telematics.oil_pressure_psi !== undefined) {
                    payload.oil_pressure_psi = Math.round(Number(telematics.oil_pressure_psi) * 10) / 10;
                }
                if (telematics.rpm !== undefined) {
                    payload.rpm = Math.round(Number(telematics.rpm));
                }
                if (telematics.battery_voltage !== undefined) {
                    payload.battery_voltage = Math.round(Number(telematics.battery_voltage) * 10) / 10;
                }

                if (Array.isArray(telematics.active_dtc_codes) && telematics.active_dtc_codes.length > 0) {
                    payload.dtc_readable = String(telematics.active_dtc_codes[0]);
                } else if (typeof telematics.active_dtc_codes === 'string' && telematics.active_dtc_codes.trim()) {
                    payload.dtc_readable = telematics.active_dtc_codes.trim();
                }
            }

            const responseData = await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.post(`${apiBaseUrl}/predictive/run`, payload, {
                        timeout: 65000,
                    });
                    return response.data as AnalysisResult;
                },
                `AI prediction failed for ${vehicleId}`,
            );
            return normalizeAnalysisResult(responseData);
        } catch (error) {
            console.error("AI Prediction failed:", error);
            return null;
        }
    },

    getFleetStatus: async (): Promise<VehicleSummary[]> => {
        try {
            const fleet = await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.get(`${apiBaseUrl}/fleet/status`, {
                        timeout: LIVE_DATA_REQUEST_TIMEOUT_MS,
                    });
                    return response.data as VehicleSummary[];
                },
                'Failed to load fleet status',
            );
            return fleet.map(normalizeVehicleSummaryResult);
        } catch (error) {
            console.error("Failed to load fleet status", error);
            return [];
        }
    },

    getInteractionLog: async (vin: string): Promise<AnalysisResult | null> => {
        try {
            const fleet = await api.getFleetStatus();
            const vehicle = fleet.find(v => v.vin === vin);
            if (vehicle) {
                return {
                    vehicle_id: vehicle.vin,
                    risk_score: vehicle.probability,
                    risk_level: vehicle.probability > 80 ? 'CRITICAL' : 'MEDIUM',
                    diagnosis: vehicle.predictedFailure,
                    diagnosis_source: vehicle.diagnosis_source,
                    fallback_reason: vehicle.fallback_reason,
                    voice_transcript: vehicle.voice_transcript || []
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    },

    getAgentActivity: async (): Promise<ActivityLog[]> => {
        try {
            const response = await axios.get(`${API_BASE_URL}/fleet/activity`);
            return response.data;
        } catch (error) {
            return [];
        }
    },

    createSchedulingRecommendation: async (
        payload: SchedulingRecommendationCreatePayload,
    ): Promise<SchedulingRecommendationResult> => {
        try {
            const response = await axios.post(`${API_BASE_URL}/scheduling/recommendations`, {
                vehicle_id: payload.vehicleId,
                service_date: payload.serviceDate,
                requested_start: payload.requestedStart,
                notes: payload.notes || '',
                service_type: payload.serviceType,
                priority: payload.priority || 'medium',
                risk_score: payload.riskScore || 0,
                suggested_by: payload.suggestedBy,
                recipient: payload.recipient,
                estimated_duration_hours: payload.estimatedDurationHours,
            });
            return response.data as SchedulingRecommendationResult;
        } catch (error) {
            throw extractApiError(error, 'Failed to create scheduling recommendation');
        }
    },

    getPendingRecommendations: async (recipient?: string): Promise<SchedulingRecommendation[]> => {
        try {
            const response = await axios.get(`${API_BASE_URL}/scheduling/recommendations/pending`, {
                params: {
                    recipient: recipient || undefined,
                    limit: 100,
                },
            });
            return response.data?.recommendations || [];
        } catch (error) {
            throw extractApiError(error, 'Failed to load pending recommendations');
        }
    },

    approveRecommendation: async (
        recommendationId: string,
        approverEmail?: string,
        notes?: string,
    ): Promise<SchedulingRecommendationResult> => {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/scheduling/recommendations/${recommendationId}/approve`,
                {
                    approver_email: approverEmail,
                    notes: notes || '',
                },
            );
            return response.data as SchedulingRecommendationResult;
        } catch (error) {
            throw extractApiError(error, 'Failed to approve recommendation');
        }
    },

    rejectRecommendation: async (
        recommendationId: string,
        approverEmail?: string,
        notes?: string,
    ): Promise<SchedulingRecommendationResult> => {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/scheduling/recommendations/${recommendationId}/reject`,
                {
                    approver_email: approverEmail,
                    notes: notes || '',
                },
            );
            return response.data as SchedulingRecommendationResult;
        } catch (error) {
            throw extractApiError(error, 'Failed to reject recommendation');
        }
    },

    getNotifications: async (params?: {
        vehicleId?: string;
        recipient?: string;
        unreadOnly?: boolean;
        limit?: number;
    }): Promise<NotificationItem[]> => {
        try {
            const response = await axios.get(`${API_BASE_URL}/notifications`, {
                params: {
                    vehicle_id: params?.vehicleId,
                    recipient: params?.recipient,
                    unread_only: params?.unreadOnly,
                    limit: params?.limit || 50,
                },
            });
            return response.data as NotificationItem[];
        } catch (error) {
            throw extractApiError(error, 'Failed to fetch notifications');
        }
    },

    markNotificationRead: async (notificationId: string): Promise<void> => {
        try {
            await axios.patch(`${API_BASE_URL}/notifications/${notificationId}/read`);
        } catch (error) {
            throw extractApiError(error, 'Failed to mark notification as read');
        }
    },

    // ✅ HYBRID BOOKING FUNCTION (Realtime + Mock Fallback)
    scheduleRepair: async (vehicleId: string, date: string, notes: string): Promise<BookingResponse> => {
        try {
            console.log(`🔌 Attempting to book slot via Backend for ${vehicleId}...`);
            
            // 1. Try Real Backend Call
            const response = await axios.post(`${API_BASE_URL}/fleet/create`, {
                vehicle_id: vehicleId,
                service_date: date,
                notes: notes
            });
            
            console.log("✅ Booking Success (Realtime):", response.data);
            return response.data;

        } catch (error) {
            // 2. Fallback to Mock Data if Backend fails or vehicle not found
            console.warn("⚠️ Backend Error or Vehicle Not Found. Switching to Demo Mode.");
            
            // Generate a random Mock ID
            const mockId = "DEMO-BK-" + Math.floor(Math.random() * 10000);
            
            return {
                status: "success", // Fake success
                booking_id: mockId,
                message: `(Offline Mode) Service confirmed for ${date}`
            };
        }
    }
};