import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'; 
import { Badge } from '../ui/badge'; 
import { Button } from '../ui/button'; 
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RefreshCw, AlertCircle, Clock3 } from 'lucide-react';

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

const bayDefinitions = [
  { id: 'bay-1', name: 'Bay 1 (Heavy / Critical)' },
  { id: 'bay-2', name: 'Bay 2 (Electrical)' },
  { id: 'bay-3', name: 'Bay 3 (General)' },
  { id: 'bay-4', name: 'Bay 4 (Express)' },
];

const buildEmptyBays = (): ServiceBay[] => bayDefinitions.map((bay) => ({ ...bay, appointments: [] }));

const getBayIdForVehicle = (vehicleId: string): string => {
  const normalized = String(vehicleId || '').trim();
  if (!normalized) {
    return bayDefinitions[0].id;
  }

  const checksum = normalized
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return bayDefinitions[checksum % bayDefinitions.length].id;
};

interface SchedulerCalendarProps {
  refreshToken?: number;
}

export function SchedulerCalendar({ refreshToken = 0 }: SchedulerCalendarProps) {
  const [currentDateObj, setCurrentDateObj] = useState(new Date());
  const [bays, setBays] = useState<ServiceBay[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestBookingDate, setLatestBookingDate] = useState<Date | null>(null);

  const formattedDate = currentDateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  // Use local date instead of UTC conversion to keep scheduler slots aligned.
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

  // Fetch live bookings and place them into bays.
  const loadSchedule = async () => {
    setLoading(true);
    
    try {
      const [fleet, bookings] = await Promise.all([
        api.getFleetStatus(),
        api.getServiceBookings({ limit: 1000 }),
      ]);

      const fleetByVehicle = new Map(fleet.map((vehicle) => [vehicle.vin, vehicle]));
      const populatedBays = buildEmptyBays();

      const latest = bookings
        .map((booking) => new Date(booking.scheduled_date))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      setLatestBookingDate(latest || null);

      for (const booking of bookings) {
        if (!booking?.scheduled_date) {
          continue;
        }

        const bookingDate = new Date(booking.scheduled_date);
        if (Number.isNaN(bookingDate.getTime())) {
          continue;
        }

        const bookingDateLocal = new Date(bookingDate.getTime() - (bookingDate.getTimezoneOffset() * 60000))
          .toISOString()
          .split('T')[0];
        if (bookingDateLocal !== logicDate) {
          continue;
        }

        const vehicle = fleetByVehicle.get(booking.vehicle_id);
        const bayId = getBayIdForVehicle(booking.vehicle_id);
        const bayIndex = populatedBays.findIndex((entry) => entry.id === bayId);
        if (bayIndex < 0) {
          continue;
        }

        const time = bookingDate.toTimeString().slice(0, 5);
        const hasCollision = populatedBays[bayIndex].appointments.some((appointment) => appointment.time === time);

        populatedBays[bayIndex].appointments.push({
          id: booking.booking_id,
          time,
          duration: Number(booking.estimated_duration_hours || 1),
          vin: booking.vehicle_id,
          model: vehicle?.model || 'Unknown Model',
          service: booking.service_type || vehicle?.predictedFailure || 'Scheduled Service',
          status: hasCollision ? 'conflict' : booking.status === 'confirmed' ? 'auto-scheduled' : 'manual',
          customer: vehicle?.vin || booking.vehicle_id,
        });
      }

      setBays(populatedBays);
    } catch (e) {
      console.error("Failed to sync schedule", e);
      setBays(buildEmptyBays());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSchedule(); }, [currentDateObj, refreshToken]); 

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
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Service Bay Scheduler</CardTitle>
            <p className="text-sm text-slate-600 mt-1">Mumbai Central Service Center · Dispatch Grid</p>
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
             <span className="text-slate-500">AI Confirmed</span>
          </div>
          <div className="flex items-center space-x-2">
             <div className="w-3 h-3 bg-blue-50 border border-blue-400 rounded-sm" />
             <span className="text-slate-500">Manual Queue</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-500"><RefreshCw className="w-6 h-6 animate-spin mr-2"/> Syncing with AI Dispatcher...</div>
        ) : (
            <div className="border rounded-lg overflow-hidden bg-white">
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
                <div key={bay.id} className="p-2 border-r min-h-[90px] relative"> 
                        {appointment && statusInfo && (
                  <div className={`rounded-md p-2.5 text-xs h-full shadow-sm border flex flex-col justify-between transition-all hover:shadow-md ${
                            appointment.status === 'auto-scheduled' ? 'bg-green-50 border-green-200 text-green-900' :
                            appointment.status === 'manual' ? 'bg-blue-50 border-blue-200 text-blue-900' :
                            'bg-amber-50 border-amber-200 text-amber-900'
                            }`}>
                            
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-start gap-1">
                                    <div className={`w-2 h-2 mt-1 rounded-full ${statusInfo.color} ${statusInfo.glow}`} title={statusInfo.label} />
                                    <div>
                          <span className="font-bold block leading-none">{appointment.vin}</span>
                          <span className="text-[10px] opacity-75">{appointment.model}</span>
                                    </div>
                                </div>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-white/70">{appointment.duration}h</Badge>
                            </div>

                    <div className="mt-1 rounded-md border border-white/70 bg-white/65 px-2 py-1.5 text-[11px]">
                      <div className="flex items-center gap-1 text-slate-700">
                      <Clock3 className="h-3 w-3" />
                      <span>{appointment.time} slot</span>
                      </div>
                      <p className="mt-1 truncate font-medium" title={appointment.service}>{appointment.service}</p>
                            </div>

                    <div className="mt-1 flex justify-between items-end text-[10px] uppercase tracking-wide opacity-80">
                      <span>{statusInfo.label}</span>
                      <span>{appointment.status === 'conflict' ? 'Conflict' : appointment.status === 'manual' ? 'Manual' : 'AI'}</span>
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