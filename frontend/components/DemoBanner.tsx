import { motion } from 'framer-motion';
import { Info } from 'lucide-react';

interface DemoBannerProps {
  show?: boolean;
}

export default function DemoBanner({ show = true }: DemoBannerProps) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-orange-50 via-green-50 to-blue-50 border-b border-slate-100"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Info className="w-3.5 h-3.5 text-[#ff9933]" />
        <span>
          <span className="text-slate-700 font-medium">Integration Mode:</span> Using configured mock integrations.
          Production supports real DigiLocker, NPCI, and blockchain providers.
        </span>
      </div>
    </motion.div>
  );
}
