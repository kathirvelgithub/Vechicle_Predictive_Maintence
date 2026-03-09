import React, { useState, useEffect } from "react";

const CookiesConsent = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already accepted cookies
    const consent = localStorage.getItem("cookieConsent");
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    // Save consent to LocalStorage so banner doesn't show again
    localStorage.setItem("cookieConsent", "true");
    setIsVisible(false);
  };

  const handleClose = () => {
    // Just close it for this session (will show again on refresh if not accepted)
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    // ✅ CHANGED: Fixed position at bottom, z-index to stay on top
    <div className="fixed bottom-6 left-0 right-0 z-[9999] px-4 md:px-6">
      <div className="container mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          
          <div className="w-full md:w-7/12 lg:w-2/3">
            <div className="mb-4 md:mb-0">
              <h4 className="mb-1 text-xl font-bold text-slate-900 dark:text-white">
                We use cookies 🍪
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                We use cookies to ensure you get the best experience on our portal. 
                This includes maintaining your login session securely.
              </p>
            </div>
          </div>

          <div className="w-full md:w-5/12 lg:w-1/3">
            <div className="flex items-center space-x-3 md:justify-end">
              <button 
                onClick={handleAccept}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Accept
              </button>
              <button 
                onClick={handleClose}
                className="inline-flex items-center justify-center rounded-md bg-slate-100 px-6 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CookiesConsent;
