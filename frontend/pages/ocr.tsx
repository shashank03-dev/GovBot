import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { getErrorMessage } from '@/lib/errorMessage';

const ALLOWED_OCR_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const;
const MAX_OCR_BYTES = 8 * 1024 * 1024;

interface OcrResult {
  name?: string;
  dob?: string;
  aadhaar_number?: string;
  gender?: string;
  address?: string;
  error?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      const [, base64 = ''] = result.split(',', 2);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function validateOcrFile(file: File) {
  if (!ALLOWED_OCR_TYPES.includes(file.type as typeof ALLOWED_OCR_TYPES[number])) {
    return 'Only JPG or PNG Aadhaar images are supported here.';
  }
  if (file.size > MAX_OCR_BYTES) {
    return 'File is too large. Please upload an Aadhaar image that is 8 MB or smaller.';
  }
  return '';
}

export default function OcrPage() {
  const [mounted, setMounted] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const token = localStorage.getItem('govbot_token');
    const storedPhone = localStorage.getItem('govbot_phone');
    if (!token || !storedPhone) { router.push('/'); return; }
  }, [mounted, router]);

  if (!mounted) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateOcrFile(file);
    if (validationError) {
      setImageFile(null);
      setImagePreview(null);
      setResult(null);
      setError(validationError);
      e.target.value = '';
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    setResult(null);
    setError('');
  }

  async function handleExtract() {
    if (!imageFile) { setError('Please upload an Aadhaar image first'); return; }
    const validationError = validateOcrFile(imageFile);
    if (validationError) { setError(validationError); return; }
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const imageB64 = await fileToBase64(imageFile);
      const phone = localStorage.getItem('govbot_phone') || '';

      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_b64: imageB64,
          phone,
          file_name: imageFile.name,
          mime_type: imageFile.type || 'image/jpeg',
        }),
      });

      const data: OcrResult = await res.json();
      if (!res.ok) throw new Error(data.error || 'OCR extraction failed');

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to extract data'));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setError('');
  }

  const fields = result ? [
    { label: 'Full Name', value: result.name, icon: '👤' },
    { label: 'Date of Birth', value: result.dob, icon: '📅' },
    { label: 'Aadhaar Number', value: result.aadhaar_number, icon: '🆔' },
    { label: 'Gender', value: result.gender, icon: '⚧' },
    { label: 'Address', value: result.address, icon: '📍' },
  ].filter(f => f.value) : [];

  return (
    <>
      <Head>
        <title>Aadhaar OCR | GovBot</title>
        <meta name="description" content="Upload Aadhaar photo to extract name, DOB, and Aadhaar number using AI OCR" />
      </Head>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <Link href="/services" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#ff9933] transition-colors">
          ← Back to Services
        </Link>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Aadhaar OCR
          </h1>
          <p className="text-sm text-slate-500 mt-1">Extract details from Aadhaar card using AI</p>
        </div>

        {/* Upload Area */}
        <motion.section
          className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-[#ff9933]/50 transition-colors mb-5 bg-slate-50/50">
            <input type="file" accept="image/jpeg,image/png" onChange={handleFileChange} className="hidden" id="aadhaar-upload" />
            <label htmlFor="aadhaar-upload" className="cursor-pointer block">
              {imagePreview ? (
                <div>
                  <Image
                    src={imagePreview}
                    alt="Aadhaar Preview"
                    width={480}
                    height={320}
                    unoptimized
                    className="max-h-48 w-auto mx-auto mb-3 rounded-lg shadow-sm"
                  />
                  <p className="text-xs text-slate-400">Click to change image</p>
                </div>
              ) : (
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto mb-3">
                    <span className="text-3xl">🆔</span>
                  </div>
                  <p className="text-sm text-slate-600">Click to upload Aadhaar card image</p>
                  <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG up to 8 MB — front side recommended</p>
                </div>
              )}
            </label>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 mb-4">{error}</p>}

          <button
            onClick={handleExtract}
            disabled={loading || !imageFile}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white font-semibold rounded-xl shadow-md shadow-cyan-200/50 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all text-sm"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Extract Details'}
          </button>
        </motion.section>

        {/* Result */}
        {result && (
          <motion.section
            className="bg-white border border-green-200 rounded-2xl p-6 shadow-sm"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-600 font-bold">✓</div>
              <div>
                <h3 className="text-base font-bold text-green-800">Data Extracted</h3>
                <p className="text-xs text-slate-500">Verify the details below</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {fields.map(f => (
                <div key={f.label} className="bg-slate-50 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="text-lg">{f.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-400">{f.label}</div>
                    <div className="text-sm font-semibold text-slate-900 truncate">{f.value}</div>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(f.value || '')}
                    className="text-xs text-slate-400 hover:text-[#ff9933] transition-colors font-medium shrink-0"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={resetForm}
                className="flex-1 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 font-medium rounded-xl text-sm hover:bg-slate-100 transition-colors"
              >
                Scan Another
              </button>
              <Link
                href="/nsp/apply"
                className="flex-1 py-2.5 bg-gradient-to-r from-[#ff9933] to-[#e67e00] text-white text-sm text-center font-semibold rounded-xl shadow-md hover:-translate-y-0.5 transition-all"
              >
                Apply Now →
              </Link>
            </div>
          </motion.section>
        )}

        {/* Info */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-500">
          <p className="font-semibold text-slate-600 mb-1">How it works</p>
          <p>This uses Gemini Vision AI to extract text from your Aadhaar card image. The extracted data can be used to pre-fill your scholarship application. Your image is processed securely and not stored.</p>
        </div>
      </div>
    </>
  );
}
