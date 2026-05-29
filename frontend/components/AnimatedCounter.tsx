import { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface AnimatedCounterProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  formatter?: (value: number) => string;
}

export default function AnimatedCounter({
  end,
  duration = 2,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
  formatter,
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const hasAnimated = useRef(false);
  const frameIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isInView || hasAnimated.current) return;
    hasAnimated.current = true;

    const startTime = Date.now();
    const startValue = 0;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (end - startValue) * easeOut;
      
      setCount(currentValue);

      if (progress < 1) {
        frameIdRef.current = requestAnimationFrame(animate);
      } else {
        setCount(end);
        frameIdRef.current = null;
      }
    };

    frameIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, [isInView, end, duration]);

  const displayValue = formatter 
    ? formatter(count)
    : count.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <motion.span
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {prefix}{displayValue}{suffix}
    </motion.span>
  );
}

// Currency formatter for Indian Rupees
export function AnimatedCurrency({
  end,
  duration = 2,
  className = '',
}: Omit<AnimatedCounterProps, 'prefix' | 'formatter'>) {
  const formatter = (value: number) => {
    return '₹' + Math.round(value).toLocaleString('en-IN');
  };

  return (
    <AnimatedCounter
      end={end}
      duration={duration}
      className={className}
      formatter={formatter}
    />
  );
}

// Stat card with animated counter
interface StatCardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  color?: 'saffron' | 'chakra' | 'electric' | 'white';
  delay?: number;
}

export function AnimatedStatCard({
  title,
  value,
  prefix = '',
  suffix = '',
  color = 'white',
  delay = 0,
}: StatCardProps) {
  const colorClasses = {
    saffron: 'from-[#ff9933] to-[#ffb366]',
    chakra: 'from-[#138808] to-[#1ab00a]',
    electric: 'from-[#00d4ff] to-[#4ce0ff]',
    white: 'from-white to-gray-300',
  };

  return (
    <motion.div
      className="bg-[#111827] rounded-xl p-6 border border-white/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    >
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">{title}</p>
      <p className={`text-4xl font-bold bg-gradient-to-r ${colorClasses[color]} bg-clip-text text-transparent`}>
        <AnimatedCounter end={value} prefix={prefix} suffix={suffix} />
      </p>
    </motion.div>
  );
}
