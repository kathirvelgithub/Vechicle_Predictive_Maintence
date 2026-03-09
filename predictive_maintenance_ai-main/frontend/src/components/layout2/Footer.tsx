export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 px-6 py-3">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <div>
          <span>© 2025 PredictAI. All rights reserved.</span>
        </div>
        <div className="flex items-center space-x-4">
          <a href="#" className="hover:text-blue-600 transition-colors">
            Terms of Service
          </a>
          <span>•</span>
          <a href="#" className="hover:text-blue-600 transition-colors">
            Privacy Policy
          </a>
          <span>•</span>
          <a href="#" className="hover:text-blue-600 transition-colors">
            Documentation
          </a>
        </div>
      </div>
    </footer>
  );
}
