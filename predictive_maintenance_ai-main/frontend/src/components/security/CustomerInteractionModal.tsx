import React from 'react';
import { X, Phone, CheckCircle, Clock, User, Bot, Calendar, Download, Play, AlertTriangle } from 'lucide-react'; // Added User, Bot, Calendar, Download, Play, AlertTriangle
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';

// --- Type Definition for Transcript Item (must match backend state) ---
interface TranscriptItem {
    id: number;
    speaker: 'AI Agent' | 'Customer';
    text: string;
    time: string;
    isVoice?: boolean;
}

// --- Type Definition for Data Prop (must match your AnalysisResult/Log type) ---
interface InteractionData {
    customerName: string;
    vin: string;
    duration: string;
    scheduledDate: string; // e.g., "December 14, 2025 at 10:00 AM"
    transcript: TranscriptItem[];
    audio_url: string | null; // CRITICAL: The URL from the backend
    customerSentiment: string;
    channel: string;
    status: 'success' | 'failure';
}

interface CustomerInteractionModalProps {
    onClose: () => void;
    data: InteractionData; // 💥 Data is now required
}

// --- FALLBACK/MOCK DATA (for development if real data is missing) ---
const mockData: InteractionData = {
    customerName: "Rajesh Kumar",
    vin: "MH04XY1234",
    duration: "1m 35s",
    scheduledDate: "December 14, 2025 at 10:00 AM",
    channel: "Voice Call",
    status: "success",
    customerSentiment: "Positive (8.5/10)",
    audio_url: null, // Set to null for initial development, or use a mock '/audio/voice_recording_MH04XY1234.mp3'
    transcript: [
        { id: 1, speaker: 'AI Agent', text: 'Hello, Mr. Kumar. This is your vehicle service assistant. My diagnostics show that your vehicle (VIN: MH04XY1234) may have a transmission issue that needs attention.', time: '10:46:15' },
        { id: 6, speaker: 'Customer', text: '10 AM tomorrow works for me.', time: '10:47:15', isVoice: true },
        { id: 7, speaker: 'AI Agent', text: 'Perfect! I\'ve booked your appointment for December 14th at 10:00 AM at Mumbai Central Service Center.', time: '10:47:22' },
    ],
};


export function CustomerInteractionModal({ onClose, data }: CustomerInteractionModalProps) {
    // Use dynamic data, fallback to mock data if the data prop is empty for safer rendering
    const interaction = data || mockData;
    
    // CRITICAL FIX LOGIC: Check if audio should be displayed
    const isAudioAvailable = !!interaction.audio_url; 

    const handleDownload = () => {
        if (interaction.audio_url) {
            window.open(interaction.audio_url, '_blank');
        } else {
            alert("Audio file path is not ready or unavailable.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                <CardHeader className="flex-shrink-0 bg-slate-50 border-b">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                             <div className="p-2 bg-blue-100 rounded-full">
                                <Phone className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">Customer Engagement Agent - Voice Interaction</CardTitle>
                                <p className="text-sm text-slate-600 mt-1">
                                    Autonomous AI agent conversation with vehicle owner
                                </p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-slate-200">
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Interaction Metadata */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-xs text-slate-600 uppercase">Customer</p>
                                <p className="text-sm font-semibold text-slate-700">{interaction.customerName}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-600 uppercase">VIN</p>
                                <p className="text-sm font-mono text-slate-700">{interaction.vin}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-600 uppercase">Channel</p>
                                <div className="flex items-center space-x-1 mt-1 text-slate-700">
                                    <Phone className="w-3 h-3" />
                                    <p className="text-sm">{interaction.channel}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-slate-600 uppercase">Duration</p>
                                <div className="flex items-center space-x-1 mt-1 text-slate-700">
                                    <Clock className="w-3 h-3" />
                                    <p className="text-sm">{interaction.duration}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Interaction Status */}
                    <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {interaction.status === 'success' ? 'Call Completed Successfully' : 'Call Failed'}
                        </Badge>
                        <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                            Appointment Auto-Scheduled
                        </Badge>
                    </div>

                    <Separator className="my-4" />

                    {/* Transcript */}
                    <div className="space-y-4">
                        <h3 className="flex items-center space-x-2 text-sm font-semibold">
                            <Bot className="w-4 h-4 text-blue-600" />
                            <span>Conversation Transcript</span>
                        </h3>

                        {interaction.transcript.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${message.speaker === 'AI Agent' ? 'justify-start' : 'justify-end'}`}
                            >
                                <div className={`max-w-[80%] rounded-lg p-3 text-sm shadow-sm ${
                                    message.speaker === 'AI Agent'
                                        ? 'bg-blue-50 border border-blue-200 rounded-tl-none'
                                        : 'bg-green-50 border border-green-200 rounded-tr-none'
                                }`}>
                                    <div className="flex items-center space-x-2 mb-1 text-xs">
                                        <span className={`font-semibold ${message.speaker === 'AI Agent' ? 'text-blue-700' : 'text-green-700'}`}>
                                            {message.speaker}
                                        </span>
                                        <span className="text-slate-500">{message.time}</span>
                                        {message.isVoice && (
                                            <Badge variant="secondary" className="text-xs px-1 py-0 bg-purple-100 text-purple-700">
                                                Voice
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-slate-800">{message.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Separator className="my-4" />

                    {/* Outcome Summary */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h3 className="mb-2 text-sm font-semibold flex items-center space-x-2 text-green-800">
                            <CheckCircle className="w-4 h-4" />
                            Interaction Outcome
                        </h3>
                        <ul className="space-y-2 text-sm">
                            <li className="flex items-start space-x-2">
                                <Calendar className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                <span>
                                    <strong>Appointment:</strong> {interaction.scheduledDate}
                                </span>
                            </li>
                            <li className="flex items-start space-x-2">
                                <User className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                <span>
                                    <strong>Customer Sentiment:</strong> {interaction.customerSentiment}
                                </span>
                            </li>
                        </ul>
                    </div>
                </CardContent>

                {/* 🔊 FOOTER WITH AUDIO PLAYER (The solution to the audio problem) */}
                <div className="flex-shrink-0 p-4 border-t flex flex-col md:flex-row items-center justify-between space-y-2 md:space-y-0 md:space-x-2 bg-slate-50">
                    
                    {isAudioAvailable ? (
                        // Audio Player is visible
                        <div className="w-full md:w-auto mr-auto flex items-center gap-3 bg-white border px-3 py-1.5 rounded-full shadow-sm">
                            <div className="p-1.5 bg-blue-100 rounded-full">
                                <Play className="w-3 h-3 text-blue-600" />
                            </div>
                            <audio controls autoPlay className="h-8 w-60 outline-none">
                                <source src={interaction.audio_url!} type="audio/mpeg" />
                                Your browser does not support the audio element.
                            </audio>
                        </div>
                    ) : (
                        // Audio unavailable message is visible
                        <div className="w-full md:w-auto mr-auto text-sm text-orange-600 flex items-center gap-1">
                            <AlertTriangle className='w-4 h-4' />
                            Audio path pending or not processed.
                        </div>
                    )}
                    
                    <div className="flex space-x-2 w-full md:w-auto justify-end">
                        <Button variant="outline" onClick={handleDownload} disabled={!isAudioAvailable}>
                            <Download className="w-4 h-4 mr-2" />
                            Download MP3
                        </Button>
                        <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white">
                            Close Log
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}