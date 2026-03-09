import { useState } from 'react';
import { X, Calendar, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { api } from '../../services/api';

interface ServiceBookingModalProps {
  vehicleId: string;
  onClose: () => void;
  onSuccess: () => void; // To refresh the parent
}

export function ServiceBookingModal({ vehicleId, onClose, onSuccess }: ServiceBookingModalProps) {
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookedId, setBookedId] = useState<string | null>(null);

  const handleBook = async () => {
    if (!date) return alert("Please pick a date");
    setLoading(true);
    try {
      const res = await api.scheduleRepair(vehicleId, date, notes);
      setBookedId(res.booking_id);
      setTimeout(() => {
        onSuccess(); // Refresh parent data
        onClose();
      }, 2000);
    } catch (e) {
      alert("Failed to book service");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <Card className="w-[400px] shadow-2xl animate-in fade-in zoom-in duration-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Schedule Repair</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {bookedId ? (
            <div className="text-center py-6 text-green-600">
              <CheckCircle className="w-16 h-16 mx-auto mb-2" />
              <h3 className="text-xl font-bold">Booking Confirmed!</h3>
              <p className="font-mono mt-1">ID: {bookedId}</p>
            </div>
          ) : (
            <>
              <div className="bg-slate-100 p-3 rounded text-sm text-slate-600">
                Booking service for <strong>{vehicleId}</strong>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Select Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input 
                    type="date" 
                    className="pl-9" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Mechanic Notes (Optional)</label>
                <Input 
                  placeholder="e.g. Check transmission fluid..." 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 mt-2" 
                onClick={handleBook}
                disabled={loading}
              >
                {loading ? "Confirming..." : "Confirm Appointment"}
              </Button>
            </>
          )}

        </CardContent>
      </Card>
    </div>
  );
}