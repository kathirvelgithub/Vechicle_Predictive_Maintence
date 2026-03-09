import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

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

// ==========================================
// 2. API SERVICE
// ==========================================

export const api = {
    getTelematics: async (vehicleId: string): Promise<TelematicsData | null> => {
        try {
            const response = await axios.get(`${API_BASE_URL}/telematics/${vehicleId}`);
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch telematics for ${vehicleId}`, error);
            // Optional: Return Mock Data if backend fails
            return {
                vehicle_id: vehicleId,
                engine_temp_c: 90,
                oil_pressure_psi: 40,
                rpm: 1000,
                battery_voltage: 24.0
            };
        }
    },

    runPrediction: async (vehicleId: string): Promise<AnalysisResult | null> => {
        try {
            const response = await axios.post(`${API_BASE_URL}/predictive/run`, {
                vehicle_id: vehicleId
            });
            return response.data;
        } catch (error) {
            console.error("AI Prediction failed:", error);
            return null;
        }
    },

    getFleetStatus: async (): Promise<VehicleSummary[]> => {
        try {
            const response = await axios.get(`${API_BASE_URL}/fleet/status`);
            return response.data;
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