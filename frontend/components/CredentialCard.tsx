import { useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle, Copy, ExternalLink, ChevronRight, Shield, Award } from 'lucide-react';
import Link from 'next/link';

interface Credential {
  credential_id: string;
  confirmation_number: string;
  scholarship_type: string;
  amount: number;
  issued_at: string;
  revoked: boolean;
  verify_url: string;
  blockchain_tx_hash?: string;
}

interface CredentialCardProps {
  credential: Credential;
  onCopy?: () => void;
}

export default function CredentialCard({ credential, onCopy }: CredentialCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(credential.verify_url);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const shortenHash = (hash: string) => {
    if (!hash || hash.length < 20) return hash;
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  return (
    <div className="relative w-full max-w-md mx-auto" style={{ perspective: '1000px' }}>
      <motion.div
        className="relative w-full cursor-pointer"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        {/* Front of card */}
        <motion.div
          className="relative overflow-hidden rounded-2xl p-6 bg-white border border-slate-100 shadow-lg"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Holographic overlay effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-[#ff9933]/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500" />
          
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-100 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-green-100 rounded-full blur-3xl" />
          </div>

          {/* Card content */}
          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#ff9933] to-[#ffb366] flex items-center justify-center">
                  <Award className="w-6 h-6 text-black" />
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wider">Scholarship</p>
                  <p className="text-slate-900 font-semibold">{credential.scholarship_type}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                <Shield className="w-3 h-3 text-green-600" />
                <span className="text-green-700 text-xs font-medium">Verified</span>
              </div>
            </div>

            {/* Amount */}
            <div className="mb-6">
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Amount</p>
              <p className="text-4xl font-bold text-slate-900">
                ₹{credential.amount.toLocaleString('en-IN')}
              </p>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider">Confirmation</p>
                <p className="text-[#ff9933] font-mono text-sm">{credential.confirmation_number}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider">Issued</p>
                <p className="text-slate-700 text-sm">{formatDate(credential.issued_at)}</p>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg">
                <QRCodeSVG 
                  value={credential.verify_url} 
                  size={64}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <div className="flex-1">
                <p className="text-slate-500 text-xs mb-2">Scan to verify on blockchain</p>
                <p className="text-slate-400 text-xs">Polygon Mumbai Testnet</p>
              </div>
            </div>

            {/* Flip hint */}
            <div className="absolute bottom-4 right-4 text-slate-400 text-xs flex items-center gap-1">
              <span>Details</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </motion.div>

        {/* Back of card */}
        <motion.div
          className="absolute inset-0 overflow-hidden rounded-2xl p-6 bg-white border border-slate-100 shadow-lg"
          style={{ 
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div className="h-full flex flex-col">
            <h3 className="text-slate-900 font-semibold mb-4">Blockchain Details</h3>
            
            <div className="space-y-4 flex-1">
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Network</p>
                <p className="text-teal-600 font-mono text-sm">Polygon Mumbai</p>
              </div>
              
              {credential.blockchain_tx_hash && (
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Transaction</p>
                  <a 
                    href={`https://mumbai.polygonscan.com/tx/${credential.blockchain_tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#ff9933] font-mono text-sm hover:underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {shortenHash(credential.blockchain_tx_hash)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Credential ID</p>
                <p className="text-slate-600 font-mono text-xs break-all">
                  {credential.credential_id}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <Link
                href={`/verify/${credential.credential_id}`}
                className="flex-1 bg-gradient-to-r from-[#ff9933] to-[#e67e00] hover:shadow-md text-white font-semibold py-2 px-4 rounded-xl text-center text-sm transition-all"
                onClick={(e) => e.stopPropagation()}
              >
                Verify
              </Link>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 rounded-xl transition-colors"
              >
                {copied ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Flip hint */}
            <div className="text-center mt-4 text-slate-400 text-xs">
              Click to flip back
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
