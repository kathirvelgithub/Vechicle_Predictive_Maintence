import axios from 'axios';
import { API_BASE_URL, API_BASE_URL_CANDIDATES } from './config';

const LIVE_DATA_REQUEST_TIMEOUT_MS = 8000;
const FLEET_STATUS_REQUEST_TIMEOUT_MS = 20000;
const FLEET_STATUS_CACHE_TTL_MS = 15000;
const FLEET_STATUS_ERROR_LOG_COOLDOWN_MS = 10000;

let fleetStatusCache: { data: VehicleSummary[]; fetchedAt: number } | null = null;
let fleetStatusInFlight: Promise<VehicleSummary[]> | null = null;
let lastFleetStatusErrorLogAt = 0;

const MOCK_VEHICLE_METADATA: Array<{
    vin: string;
    model: string;
    total_distance_km: number;
    fuel_type: string;
    next_service_date: string;
}> = [
    { vin: 'V-101', model: 'Scorpio N', total_distance_km: 12450, fuel_type: 'Diesel', next_service_date: '2026-05-22' },
    { vin: 'V-102', model: 'Scorpio Classic', total_distance_km: 9640, fuel_type: 'Diesel', next_service_date: '2026-05-28' },
    { vin: 'V-103', model: 'XUV 3XO', total_distance_km: 18210, fuel_type: 'Petrol', next_service_date: '2026-06-02' },
    { vin: 'V-104', model: 'XUV700', total_distance_km: 21890, fuel_type: 'Diesel', next_service_date: '2026-06-09' },
    { vin: 'V-301', model: 'City', total_distance_km: 20110, fuel_type: 'Petrol', next_service_date: '2026-05-27' },
    { vin: 'V-302', model: 'Elevate', total_distance_km: 15990, fuel_type: 'Petrol', next_service_date: '2026-06-04' },
    { vin: 'V-303', model: 'BE 6', total_distance_km: 8730, fuel_type: 'Electric', next_service_date: '2026-06-10' },
    { vin: 'V-304', model: 'Elevate', total_distance_km: 13380, fuel_type: 'Petrol', next_service_date: '2026-05-25' },
    { vin: 'V-403', model: 'XUV700', total_distance_km: 17640, fuel_type: 'Petrol', next_service_date: '2026-06-12' },
];

// ==========================================
// 1. INTERFACES
// ==========================================

export interface TelematicsData {
    vehicle_id: string;
    engine_temp_c: number;
    oil_pressure_psi: number;
    rpm: number;
    battery_voltage?: number;
    speed_kmh?: number;
    coolant_temp_c?: number;
    fuel_level_percent?: number;
    throttle_position_percent?: number;
    brake_pressure_psi?: number;
    risk_score?: number;
    risk_level?: string;
    anomaly_detected?: boolean;
    status?: string;
    dtc_readable?: string;
    timestamp_utc?: string;
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
    total_distance_km?: number;
    fuel_type?: string;
    next_service_date?: string;
    last_service_date?: string;
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

export interface ServiceBooking {
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
        total_distance_km: Number.isFinite(Number(vehicle.total_distance_km)) ? Number(vehicle.total_distance_km) : undefined,
        fuel_type: normalizeOptionalString(vehicle.fuel_type),
        next_service_date: normalizeOptionalString(vehicle.next_service_date),
        last_service_date: normalizeOptionalString(vehicle.last_service_date),
    };
};

const applyMockVehicleMetadata = (vehicle: VehicleSummary): VehicleSummary => {
    const vin = normalizeRequiredString(vehicle.vin, '').toUpperCase();
    const mock = MOCK_VEHICLE_METADATA.find((entry) => entry.vin === vin)
        || MOCK_VEHICLE_METADATA.find((entry) => entry.model === vehicle.model);

    if (!mock) {
        return vehicle;
    }

    return {
        ...vehicle,
        total_distance_km:
            Number.isFinite(Number(vehicle.total_distance_km)) && Number(vehicle.total_distance_km) > 0
                ? Number(vehicle.total_distance_km)
                : mock.total_distance_km,
        fuel_type: normalizeOptionalString(vehicle.fuel_type) || mock.fuel_type,
        next_service_date: normalizeOptionalString(vehicle.next_service_date) || mock.next_service_date,
        last_service_date: normalizeOptionalString(vehicle.last_service_date) || mock.next_service_date,
    };
};

const buildMockFleetStatus = (): VehicleSummary[] => {
    return MOCK_VEHICLE_METADATA.map((entry, index) => ({
        vin: entry.vin,
        model: entry.model,
        location: 'Unknown',
        telematics: 'Mock',
        predictedFailure: 'System Healthy',
        probability: 35 + (index % 4) * 10,
        action: 'Monitoring',
        total_distance_km: entry.total_distance_km,
        fuel_type: entry.fuel_type,
        next_service_date: entry.next_service_date,
        last_service_date: entry.next_service_date,
    }));
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
        const now = Date.now();
        const hasFreshCache =
            fleetStatusCache && now - fleetStatusCache.fetchedAt <= FLEET_STATUS_CACHE_TTL_MS;

        if (hasFreshCache) {
            return fleetStatusCache.data;
        }

        if (fleetStatusInFlight) {
            return fleetStatusInFlight;
        }

        fleetStatusInFlight = (async () => {
            try {
                const fleet = await requestWithApiBaseFallback(
                    async (apiBaseUrl) => {
                        const response = await axios.get(`${apiBaseUrl}/fleet/status`, {
                            timeout: FLEET_STATUS_REQUEST_TIMEOUT_MS,
                        });
                        return response.data as VehicleSummary[];
                    },
                    'Failed to load fleet status',
                );

                const normalizedFleet = fleet.map(normalizeVehicleSummaryResult).map(applyMockVehicleMetadata);
                fleetStatusCache = {
                    data: normalizedFleet,
                    fetchedAt: Date.now(),
                };
                return normalizedFleet;
            } catch (error) {
                const shouldLog = Date.now() - lastFleetStatusErrorLogAt > FLEET_STATUS_ERROR_LOG_COOLDOWN_MS;
                if (shouldLog) {
                    console.error('Failed to load fleet status', error);
                    lastFleetStatusErrorLogAt = Date.now();
                }

                if (fleetStatusCache?.data?.length) {
                    return fleetStatusCache.data;
                }

                const mockFleet = buildMockFleetStatus();
                fleetStatusCache = {
                    data: mockFleet,
                    fetchedAt: Date.now(),
                };
                return mockFleet;
            } finally {
                fleetStatusInFlight = null;
            }
        })();

        return fleetStatusInFlight;
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
            return await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.get(`${apiBaseUrl}/fleet/activity`, {
                        timeout: LIVE_DATA_REQUEST_TIMEOUT_MS,
                    });
                    return response.data as ActivityLog[];
                },
                'Failed to load agent activity',
            );
        } catch (error) {
            return [];
        }
    },

    getServiceBookings: async (params?: {
        fromDate?: string;
        toDate?: string;
        limit?: number;
    }): Promise<ServiceBooking[]> => {
        try {
            const payload = await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.get(`${apiBaseUrl}/scheduling/list`, {
                        params: {
                            from_date: params?.fromDate,
                            to_date: params?.toDate,
                            limit: params?.limit || 500,
                        },
                        timeout: LIVE_DATA_REQUEST_TIMEOUT_MS,
                    });
                    return response.data as { bookings?: ServiceBooking[] };
                },
                'Failed to load service bookings',
            );
            return Array.isArray(payload?.bookings) ? payload.bookings : [];
        } catch (error) {
            return [];
        }
    },

    createSchedulingRecommendation: async (
        payload: SchedulingRecommendationCreatePayload,
    ): Promise<SchedulingRecommendationResult> => {
        try {
            return await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.post(`${apiBaseUrl}/scheduling/recommendations`, {
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
                },
                'Failed to create scheduling recommendation',
            );
        } catch (error) {
            throw extractApiError(error, 'Failed to create scheduling recommendation');
        }
    },

    getPendingRecommendations: async (recipient?: string): Promise<SchedulingRecommendation[]> => {
        try {
            const payload = await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.get(`${apiBaseUrl}/scheduling/recommendations/pending`, {
                        params: {
                            recipient: recipient || undefined,
                            limit: 100,
                        },
                    });
                    return response.data as { recommendations?: SchedulingRecommendation[] };
                },
                'Failed to load pending recommendations',
            );
            return payload?.recommendations || [];
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
            return await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.post(
                        `${apiBaseUrl}/scheduling/recommendations/${recommendationId}/approve`,
                        {
                            approver_email: approverEmail,
                            notes: notes || '',
                        },
                    );
                    return response.data as SchedulingRecommendationResult;
                },
                'Failed to approve recommendation',
            );
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
            return await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.post(
                        `${apiBaseUrl}/scheduling/recommendations/${recommendationId}/reject`,
                        {
                            approver_email: approverEmail,
                            notes: notes || '',
                        },
                    );
                    return response.data as SchedulingRecommendationResult;
                },
                'Failed to reject recommendation',
            );
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
            return await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.get(`${apiBaseUrl}/notifications`, {
                        params: {
                            vehicle_id: params?.vehicleId,
                            recipient: params?.recipient,
                            unread_only: params?.unreadOnly,
                            limit: params?.limit || 50,
                        },
                    });
                    return response.data as NotificationItem[];
                },
                'Failed to fetch notifications',
            );
        } catch (error) {
            throw extractApiError(error, 'Failed to fetch notifications');
        }
    },

    markNotificationRead: async (notificationId: string): Promise<void> => {
        try {
            await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    await axios.patch(`${apiBaseUrl}/notifications/${notificationId}/read`);
                },
                'Failed to mark notification as read',
            );
        } catch (error) {
            throw extractApiError(error, 'Failed to mark notification as read');
        }
    },

    scheduleRepair: async (vehicleId: string, date: string, notes: string): Promise<BookingResponse> => {
        try {
            return await requestWithApiBaseFallback(
                async (apiBaseUrl) => {
                    const response = await axios.post(`${apiBaseUrl}/fleet/create`, {
                        vehicle_id: vehicleId,
                        service_date: date,
                        notes,
                    });
                    return response.data as BookingResponse;
                },
                `Failed to book slot for ${vehicleId}`,
            );
        } catch (error) {
            throw extractApiError(error, `Failed to book slot for ${vehicleId}`);
        }
    }
};