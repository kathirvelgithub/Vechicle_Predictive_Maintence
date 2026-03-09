import { useState } from 'react';
// MUI Imports
import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';

// Existing Imports
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
// Removed existing Progress import as it is replaced by Stepper
// import { Progress } from '../ui/progress'; 
import { ArrowLeft, ArrowRight, Check, Loader2, AlertCircle } from 'lucide-react';

interface RegisterProps {
  onRegister: (token: string) => void;
  onSwitchToLogin: () => void;
}

// Define the steps based on your form logic
const steps = ['Account Details', 'Role Selection', 'Location Assignment'];

export function Register({ onRegister, onSwitchToLogin }: RegisterProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
   
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '',
    location: '',
    plant: '',
  });

  const handleNext = () => {
    setError("");
    if (step === 1) {
        if (!formData.fullName || !formData.email || !formData.password) {
            setError("Please fill in all fields");
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match");
            return;
        }
    }
    if (step === 2 && !formData.role) {
        setError("Please select a role");
        return;
    }
    
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    setError("");
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:8080/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           fullName: formData.fullName,
           email: formData.email,
           password: formData.password,
           role: formData.role, 
           location: formData.location,
           plant: formData.plant
        }),
      });

      if (response.ok) {
        alert("Registration successful! Please sign in with your new account.");
        onSwitchToLogin(); 
      } else {
        setError("Registration failed. Email might exist.");
      }
    } catch (err) {
      setError("Network error. Is Spring Boot running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-8">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl mb-2 font-bold">Create Your Account</h1>
          <p className="text-slate-600">Join the OEM Aftersales Intelligence Platform</p>
        </div>

        {/* --- MUI STEPPER INTEGRATION START --- */}
        <Box sx={{ width: '100%', mb: 6 }}>
          {/* Active step is 0-indexed, so we subtract 1 from your existing step state */}
          <Stepper activeStep={step - 1} alternativeLabel>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>
        {/* --- MUI STEPPER INTEGRATION END --- */}

        <form onSubmit={handleSubmit}>
          {/* Step 1: Account Details */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                    id="password"
                    type="password"
                    placeholder="Strong password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="mt-1"
                    required
                    />
                </div>
                <div>
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="mt-1"
                    required
                    />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Role Selection */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <Label>Select Your Role</Label>
                <RadioGroup
                  value={formData.role}
                  onValueChange={(value: string) => setFormData({ ...formData, role: value })}
                  className="mt-3 space-y-3"
                >
                  <div className={`flex items-start space-x-3 border rounded-lg p-4 cursor-pointer transition-colors ${formData.role === 'service-manager' ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}`}>
                    <RadioGroupItem value="service-manager" id="service-manager" className="mt-1" />
                    <div className="flex-1" onClick={() => setFormData({...formData, role: 'service-manager'})}>
                      <Label htmlFor="service-manager" className="cursor-pointer font-medium">
                        Service Center Manager
                      </Label>
                      <p className="text-sm text-slate-600 mt-1">
                        Manage service operations
                      </p>
                    </div>
                  </div>
                  
                  <div className={`flex items-start space-x-3 border rounded-lg p-4 cursor-pointer transition-colors ${formData.role === 'manufacturing-engineer' ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}`}>
                    <RadioGroupItem value="manufacturing-engineer" id="manufacturing-engineer" className="mt-1" />
                    <div className="flex-1" onClick={() => setFormData({...formData, role: 'manufacturing-engineer'})}>
                      <Label htmlFor="manufacturing-engineer" className="cursor-pointer font-medium">
                        Manufacturing Engineer
                      </Label>
                      <p className="text-sm text-slate-600 mt-1">
                        Access quality insights
                      </p>
                    </div>
                  </div>

                  <div className={`flex items-start space-x-3 border rounded-lg p-4 cursor-pointer transition-colors ${formData.role === 'system-admin' ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}`}>
                    <RadioGroupItem value="system-admin" id="system-admin" className="mt-1" />
                    <div className="flex-1" onClick={() => setFormData({...formData, role: 'system-admin'})}>
                      <Label htmlFor="system-admin" className="cursor-pointer font-medium">
                        System Administrator
                      </Label>
                      <p className="text-sm text-slate-600 mt-1">
                        System configurations
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}

          {/* Step 3: Location Assignment */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <Label htmlFor="location">Primary Location</Label>
                <Select
                  value={formData.location}
                  onValueChange={(value: string) => setFormData({ ...formData, location: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select your location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mumbai">Mumbai, Maharashtra</SelectItem>
                    <SelectItem value="chennai">Chennai, Tamil Nadu</SelectItem>
                    <SelectItem value="bangalore">Bangalore, Karnataka</SelectItem>
                    <SelectItem value="delhi">Delhi NCR</SelectItem>
                    <SelectItem value="pune">Pune, Maharashtra</SelectItem>
                    <SelectItem value="hyderabad">Hyderabad, Telangana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="plant">Manufacturing Plant / Service Center</Label>
                <Select
                  value={formData.plant}
                  onValueChange={(value: string) => setFormData({ ...formData, plant: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select your facility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plant-001">Plant 001 - Manesar</SelectItem>
                    <SelectItem value="plant-002">Plant 002 - Sanand</SelectItem>
                    <SelectItem value="sc-mumbai-central">Service Center - Mumbai Central</SelectItem>
                    <SelectItem value="sc-chennai-north">Service Center - Chennai North</SelectItem>
                    <SelectItem value="sc-bangalore-east">Service Center - Bangalore East</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                <div className="flex items-start space-x-3">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm">
                      By creating an account, you agree to the Terms of Service.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-md text-sm mt-4">
               <AlertCircle className="w-4 h-4" />
               <span>{error}</span>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            <div>
              {step > 1 ? (
                <Button type="button" variant="outline" onClick={handleBack} disabled={loading}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={onSwitchToLogin} disabled={loading}>
                  Already have an account?
                </Button>
              )}
            </div>
            <div>
              {step < 3 ? (
                <Button type="button" onClick={handleNext}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                    </>
                  ) : (
                    <>
                        Create Account
                        <Check className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}