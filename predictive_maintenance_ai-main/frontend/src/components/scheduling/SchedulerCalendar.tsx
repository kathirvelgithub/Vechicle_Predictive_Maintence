import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'; 
import { Badge } from '../ui/badge'; 
import { Button } from '../ui/button'; 
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RefreshCw, AlertCircle } from 'lucide-react';

// ✅ Import your API Bridge
import { api } from '../../services/api'; 

// --- TYPES ---
interface ServiceBay {
  id: string;
  name: string;
  appointments: Appointment[];
}

interface Appointment {
  id: string;
  time: string;
  duration: number;
  vin: string;
  model: string;
  service: string;
  status: 'auto-scheduled' | 'manual' | 'conflict';
  customer: string;
}

const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

// 🖼️ HELPER: Get Image URL based on Car Model
const getVehicleImage = (model: string) => {
  const m = model || ""; 
  // Specific check for our Demo Vehicle
  if (m.includes('V-101') || m.includes('Scorpio')) return 'https://i.pinimg.com/736x/f2/cf/5e/f2cf5ef4e4b51d29e3420fc32105c3ca.jpg';

  if (m.includes('Thar')) return 'https://imgd.aeplcdn.com/370x208/n/cw/ec/40087/thar-exterior-right-front-three-quarter-11.jpeg';
  if (m.includes('Scorpio N')) return 'https://i.pinimg.com/736x/f2/cf/5e/f2cf5ef4e4b51d29e3420fc32105c3ca.jpg';
  if (m.includes('XUV 3XO') || m.includes('3XO')) return 'https://imgd.aeplcdn.com/370x208/n/cw/ec/156405/xuv-3xo-exterior-right-front-three-quarter-33.jpeg';
  if (m.includes('XUV700')) return 'https://imgd.aeplcdn.com/370x208/n/cw/ec/42355/xuv700-exterior-right-front-three-quarter-3.jpeg'; 
  if (m.includes('City')) return 'https://imgd.aeplcdn.com/370x208/n/cw/ec/134287/city-exterior-right-front-three-quarter-77.jpeg'; 
  if (m.includes('Elevate')) return 'https://i.pinimg.com/1200x/a6/42/c4/a642c4eaf195c46ef3adbc1e13dac0e4.jpg'; 
  if (m.includes('Fortuner')) return 'https://i.pinimg.com/1200x/b8/a3/19/b8a319905659c8f0fae009dcc47906c0.jpg';
  if (m.includes('Creta')) return 'https://imgd.aeplcdn.com/370x208/n/cw/ec/141115/creta-exterior-right-front-three-quarter.jpeg';
  if (m.includes('Nexon')) return 'https://imgd.aeplcdn.com/370x208/n/cw/ec/141867/nexon-exterior-right-front-three-quarter-71.jpeg';
  if (m.includes('Innova')) return 'https://i.pinimg.com/1200x/fe/e6/ee/fee6eea7b191112a744e2bf23a277871.jpg';
  return 'https://imgd.aeplcdn.com/370x208/n/cw/ec/130591/fronx-exterior-right-front-three-quarter-109.jpeg';
};

export function SchedulerCalendar() {
  const [currentDateObj, setCurrentDateObj] = useState(new Date());
  const [bays, setBays] = useState<ServiceBay[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestBookingDate, setLatestBookingDate] = useState<Date | null>(null);

  const formattedDate = currentDateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  // Logic date for Mock Generator: Local YYYY-MM-DD (Fixes timezone issues)
  const logicDate = new Date(currentDateObj.getTime() - (currentDateObj.getTimezoneOffset() * 60000))
    .toISOString()
    .split('T')[0];

  // 🕒 HELPER: Determine if Service is Finished or Pending
  const getServiceStatus = (apptTime: string) => {
    const now = new Date();
    const apptDateTime = new Date(currentDateObj);
    const [hours, minutes] = apptTime.split(':').map(Number);
    apptDateTime.setHours(hours, minutes, 0, 0);

    if (apptDateTime < now) {
        return { color: 'bg-green-500', label: 'Completed', glow: '' };
    } else {
        return { color: 'bg-red-500', label: 'Pending', glow: 'animate-pulse' };
    }
  };

  // 🎲 GENERATOR: Create Mock Schedule
  const generateMockSchedule = (dateStr: string): ServiceBay[] => {
    const day = parseInt(dateStr.split('-')[2]) || 1;
    const isEvenDay = day % 2 === 0;

    return [
        {
          id: 'bay-1', name: 'Bay 1 (Heavy / Critical)',
          appointments: isEvenDay ? [
            { id: 'm-101', time: '14:00', duration: 3, vin: 'KA-01-AB-999', model: 'Toyota Fortuner', service: 'Suspension Overhaul', status: 'manual', customer: 'VIP Transport' }
          ] : [], 
        },
        {
          id: 'bay-2', name: 'Bay 2 (Electrical)',
          appointments: isEvenDay ? [
            { id: 'm-201', time: '09:00', duration: 2, vin: 'MH-02-CD-123', model: 'Mahindra XUV 3XO', service: 'Battery Voltage Check', status: 'manual', customer: 'Urban Fleet' },
            { id: 'm-202', time: '12:00', duration: 2, vin: 'DL-04-EF-456', model: 'Tata Nexon EV', service: 'Software Update', status: 'manual', customer: 'Eco Cabs' },
          ] : [
            { id: 'm-203', time: '10:00', duration: 3, vin: 'WB-05-GH-789', model: 'Honda City Hybrid', service: 'Hybrid System Check', status: 'conflict', customer: 'Green Taxi' }
          ],
        },
        {
          id: 'bay-3', name: 'Bay 3 (General)',
          appointments: isEvenDay ? [
            { id: 'm-301', time: '10:00', duration: 4, vin: 'GJ-06-IJ-101', model: 'Mahindra Thar', service: 'Oil Pressure Sensor', status: 'manual', customer: 'Adventure Tours' },
          ] : [
            { id: 'm-302', time: '09:00', duration: 2, vin: 'TN-07-KL-202', model: 'Hyundai Creta', service: 'Brake Pad Replacement', status: 'manual', customer: 'Rental Co.' },
            { id: 'm-303', time: '14:00', duration: 2, vin: 'UP-08-MN-303', model: 'Mahindra Scorpio N', service: 'Routine Service', status: 'manual', customer: 'Logistics Ltd' },
          ],
        },
        {
          id: 'bay-4', name: 'Bay 4 (Express)',
          appointments: isEvenDay ? [
            { id: 'm-401', time: '09:00', duration: 1, vin: 'HR-09-OP-404', model: 'Honda City', service: 'Wiper Fluid Check', status: 'manual', customer: 'Corporate Lease' },
            { id: 'm-402', time: '11:00', duration: 1.5, vin: 'PB-10-QR-505', model: 'Honda Elevate', service: 'Alignment Check', status: 'manual', customer: 'Corporate Lease' },
          ] : [
            { id: 'm-403', time: '13:00', duration: 1, vin: 'RJ-11-ST-606', model: 'Toyota Innova', service: 'Quick Wash & Check', status: 'manual', customer: 'Hotel Fleet' }
          ],
        },
      ];
  };

  // 🚀 MAIN LOGIC: Fetch Backend Data & Merge with Mock Data
  const loadSchedule = async () => {
    setLoading(true);
    
    try {
      const fleet = await api.getFleetStatus();
      
      // Filter for bookings created by your AI Agent
      const realBookings = fleet.filter((v: any) => (v.action === 'Service Booked' || v.scheduled_date) && v.scheduled_date);

      // Latest Booking Logic (Jump Button)
      if (realBookings.length > 0) {
        realBookings.sort((a: any, b: any) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());
        const lastBooking = realBookings[0];
        if (lastBooking.scheduled_date) {
            const dateString = lastBooking.scheduled_date.split(' ')[0]; 
            // Add Noon time to prevent timezone rollover
            setLatestBookingDate(new Date(`${dateString}T12:00:00`));
        }
      }

      // Generate Base Schedule (Mock Data)
      const baseSchedule = generateMockSchedule(logicDate);

      // 💉 INJECT REAL BOOKINGS
      realBookings.forEach((vehicle: any) => {
          if (!vehicle.scheduled_date) return;
          
          const [vDateString, vTimeFull] = vehicle.scheduled_date.split(' '); // "2025-12-17" and "11:00"
          
          // STRICT DATE MATCHING (No Timezones)
          const [bYear, bMonth, bDay] = vDateString.split('-').map(Number);
          const cYear = currentDateObj.getFullYear();
          const cMonth = currentDateObj.getMonth() + 1; // JS Month is 0-indexed
          const cDay = currentDateObj.getDate();

          const isSameDay = (bYear === cYear) && (bMonth === cMonth) && (bDay === cDay);

          if (isSameDay) {
              const timeSlot = vTimeFull.substring(0, 5); // "09:00"
              
              // 🚑 FORCE MODEL NAME FOR V-101
              let displayModel = vehicle.model || 'Unknown Model';
              if (vehicle.vin === 'V-101') {
                  displayModel = 'Mahindra Scorpio N';
              }

              // 🚨 NUCLEAR OPTION: Find Bay 1 and DESTROY any appointment at this time
              const bay1Index = baseSchedule.findIndex(b => b.id === 'bay-1');
              
              if (bay1Index !== -1) {
                  // Filter out the conflict
                  baseSchedule[bay1Index].appointments = baseSchedule[bay1Index].appointments.filter(
                      appt => appt.time !== timeSlot
                  );

                  // Push the Real Booking
                  baseSchedule[bay1Index].appointments.push({
                      id: `real-${vehicle.vin}`,
                      time: timeSlot, 
                      duration: 2, 
                      vin: vehicle.vin,
                      model: displayModel, // ✅ Uses forced model name
                      service: vehicle.predictedFailure || 'Critical AI Repair',
                      status: 'auto-scheduled',
                      customer: 'AI Priority Booking'
                  });
              }
          }
      });

      setBays(baseSchedule);
    } catch (e) {
      console.error("Failed to sync schedule", e);
      setBays(generateMockSchedule(logicDate));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSchedule(); }, [currentDateObj]); 

  // --- NAVIGATION HANDLERS ---
  const changeDate = (days: number) => {
    const newDate = new Date(currentDateObj);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDateObj(newDate);
  };

  const jumpToDate = (targetDate: Date) => { setCurrentDateObj(targetDate); };
  
  const getAppointmentAtTime = (bay: ServiceBay, timeSlot: string) => 
    bay.appointments.find((apt) => apt.time === timeSlot);

  // --- RENDER ---
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Service Bay Scheduler</CardTitle>
            <p className="text-sm text-slate-600 mt-1">Mumbai Central Service Center</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center space-x-4">
                <Button variant="outline" size="icon" onClick={() => changeDate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
                <div className="flex items-center space-x-2 px-3 min-w-[180px] justify-center font-mono">
                    <CalendarIcon className="w-4 h-4 text-slate-600" />
                    <span>{formattedDate}</span>
                </div>
                <Button variant="outline" size="icon" onClick={() => changeDate(1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
            {latestBookingDate && latestBookingDate.toDateString() !== currentDateObj.toDateString() && (
                 <Button variant="destructive" size="sm" className="animate-pulse shadow-lg" onClick={() => jumpToDate(latestBookingDate)}>
                    <AlertCircle className="w-4 h-4 mr-2" /> Booking on {latestBookingDate.toLocaleDateString()} &rarr;
                 </Button>
            )}
          </div>
        </div>
        
        {/* LEGEND */}
        <div className="flex items-center space-x-6 mt-4 text-sm border-t pt-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            <span className="text-slate-600 font-medium">Completed</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-slate-600 font-medium">Pending</span>
          </div>
          <div className="h-4 w-px bg-slate-300 mx-2"></div> 
          <div className="flex items-center space-x-2">
             <div className="w-3 h-3 bg-green-100 border border-green-500 rounded-sm" />
             <span className="text-slate-500">Auto-AI</span>
          </div>
          <div className="flex items-center space-x-2">
             <div className="w-3 h-3 bg-blue-50 border border-blue-400 rounded-sm" />
             <span className="text-slate-500">Manual</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-500"><RefreshCw className="w-6 h-6 animate-spin mr-2"/> Syncing with AI Dispatcher...</div>
        ) : (
            <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-5 bg-slate-50">
                <div className="p-3 border-r border-b font-medium text-slate-500 text-sm">Time</div>
                {bays.map((bay) => (<div key={bay.id} className="p-3 border-r border-b text-center font-bold text-slate-700">{bay.name}</div>))}
            </div>
            {timeSlots.map((timeSlot) => (
                <div key={timeSlot} className="grid grid-cols-5 border-b hover:bg-slate-50/50 transition-colors">
                <div className="p-3 border-r text-sm text-slate-500 font-mono">{timeSlot}</div>
                {bays.map((bay) => {
                    const appointment = getAppointmentAtTime(bay, timeSlot);
                    const statusInfo = appointment ? getServiceStatus(appointment.time) : null;

                    return (
                    <div key={bay.id} className="p-1 border-r min-h-[100px] relative"> 
                        {appointment && statusInfo && (
                        <div className={`rounded-md p-2 text-xs h-full shadow-sm border flex flex-col justify-between transition-all hover:shadow-md ${
                            appointment.status === 'auto-scheduled' ? 'bg-green-50 border-green-200 text-green-900' :
                            appointment.status === 'manual' ? 'bg-blue-50 border-blue-200 text-blue-900' :
                            'bg-amber-50 border-amber-200 text-amber-900'
                            }`}>
                            
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-start gap-1">
                                    <div className={`w-2 h-2 mt-1 rounded-full ${statusInfo.color} ${statusInfo.glow}`} title={statusInfo.label} />
                                    <div>
                                        <span className="font-bold block leading-none">{appointment.vin}</span>
                                        <span className="text-[9px] opacity-70 uppercase tracking-wider">{statusInfo.label}</span>
                                    </div>
                                </div>
                                <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-white/60">{appointment.duration}h</Badge>
                            </div>

                            <div className="w-full h-12 mb-1 overflow-hidden rounded bg-white/50 flex items-center justify-center group">
                                <img 
                                    src={getVehicleImage(appointment.model)} 
                                    alt={appointment.model} 
                                    className="object-cover w-full h-full opacity-90 group-hover:scale-110 transition-transform duration-500"
                                />
                            </div>

                            <div className="flex justify-between items-end">
                                <p className="font-medium leading-tight mb-0.5 truncate flex-1" title={appointment.service}>{appointment.service}</p>
                            </div>
                        </div>
                        )}
                    </div>
                    );
                })}
                </div>
            ))}
            </div>
        )}
      </CardContent>
    </Card>
  );
}