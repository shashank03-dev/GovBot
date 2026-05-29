import type {CSSProperties, ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const palette = {
  ink: '#10201d',
  muted: '#55706a',
  paper: '#f7f3ea',
  panel: '#fffaf0',
  lime: '#cbe86b',
  green: '#2f7d57',
  teal: '#3aa99e',
  saffron: '#f29d38',
  blue: '#3777c8',
  rose: '#d85b6a',
  line: 'rgba(16, 32, 29, 0.15)',
};

const sceneTitle: CSSProperties = {
  margin: 0,
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: 72,
  lineHeight: 0.95,
  letterSpacing: 0,
  color: palette.ink,
  fontWeight: 850,
};

const eyebrow: CSSProperties = {
  margin: 0,
  color: palette.green,
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: 24,
  fontWeight: 760,
  letterSpacing: 0,
};

const bodyText: CSSProperties = {
  margin: 0,
  color: palette.muted,
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: 28,
  lineHeight: 1.35,
  fontWeight: 560,
  letterSpacing: 0,
};

const softShadow = '0 24px 70px rgba(20, 55, 43, 0.14)';

const enter = (frame: number, delay = 0) =>
  spring({
    frame: frame - delay,
    fps: 30,
    config: {
      damping: 18,
      stiffness: 110,
      mass: 0.8,
    },
  });

const fade = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

const Drift = ({children, x = 0, y = 0}: {children: ReactNode; x?: number; y?: number}) => {
  const frame = useCurrentFrame();
  const dx = Math.sin((frame + x) / 42) * 10;
  const dy = Math.cos((frame + y) / 48) * 8;

  return <div style={{transform: `translate(${dx}px, ${dy}px)`}}>{children}</div>;
};

const Background = () => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame % 180, [0, 180], [-220, 1280], {
    easing: Easing.inOut(Easing.sin),
  });

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 12% 18%, rgba(203, 232, 107, 0.32), transparent 28%), radial-gradient(circle at 88% 18%, rgba(58, 169, 158, 0.22), transparent 26%), linear-gradient(135deg, #fbf7ef 0%, #f2efe6 48%, #eaf2df 100%)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 36,
          border: `1px solid ${palette.line}`,
          borderRadius: 34,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: sweep,
          top: -80,
          width: 180,
          height: 880,
          transform: 'rotate(18deg)',
          background:
            'linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.62), transparent)',
          filter: 'blur(6px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 84,
          bottom: 74,
          width: 500,
          height: 1,
          background: palette.line,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 92,
          top: 82,
          width: 280,
          height: 1,
          background: palette.line,
        }}
      />
    </AbsoluteFill>
  );
};

const Pill = ({
  label,
  color,
  progress,
}: {
  label: string;
  color: string;
  progress: number;
}) => (
  <div
    style={{
      height: 52,
      borderRadius: 999,
      border: `1px solid ${palette.line}`,
      background: palette.panel,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '0 22px',
      boxShadow: '0 12px 30px rgba(20, 55, 43, 0.08)',
      transform: `translateY(${(1 - progress) * 26}px)`,
      opacity: progress,
    }}
  >
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: 999,
        background: color,
      }}
    />
    <span
      style={{
        color: palette.ink,
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontSize: 20,
        fontWeight: 760,
      }}
    >
      {label}
    </span>
  </div>
);

const PhoneFrame = ({progress}: {progress: number}) => {
  const messages = [
    {side: 'left', text: 'Need scholarship help'},
    {side: 'right', text: 'Send Aadhaar, marksheet, income proof'},
    {side: 'left', text: 'Uploaded'},
    {side: 'right', text: 'Profile ready. Opening dashboard.'},
  ];

  return (
    <div
      style={{
        width: 344,
        height: 594,
        borderRadius: 42,
        background: '#16241f',
        padding: 18,
        boxShadow: softShadow,
        transform: `translateY(${(1 - progress) * 80}px) rotate(${(1 - progress) * -4}deg)`,
        opacity: progress,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 30,
          background: '#e9f3df',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: 74,
            background: palette.green,
            display: 'flex',
            alignItems: 'center',
            padding: '0 22px',
            color: '#f8fff0',
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
            fontSize: 18,
            fontWeight: 800,
          }}
        >
          GovBot on WhatsApp
        </div>
        <div style={{padding: 18, display: 'flex', flexDirection: 'column', gap: 16}}>
          {messages.map((message, index) => {
            const local = Math.max(0, Math.min(1, progress * 1.4 - index * 0.2));
            return (
              <div
                key={message.text}
                style={{
                  alignSelf: message.side === 'right' ? 'flex-end' : 'flex-start',
                  maxWidth: 235,
                  borderRadius: 18,
                  borderTopLeftRadius: message.side === 'left' ? 5 : 18,
                  borderTopRightRadius: message.side === 'right' ? 5 : 18,
                  background: message.side === 'right' ? '#dcf8c6' : palette.panel,
                  color: palette.ink,
                  padding: '13px 15px',
                  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                  fontSize: 17,
                  fontWeight: 680,
                  lineHeight: 1.22,
                  boxShadow: '0 8px 18px rgba(20, 55, 43, 0.08)',
                  opacity: local,
                  transform: `translateY(${(1 - local) * 18}px)`,
                }}
              >
                {message.text}
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 18,
            left: 18,
            right: 18,
            height: 48,
            borderRadius: 999,
            background: '#f8fff0',
            border: `1px solid ${palette.line}`,
          }}
        />
      </div>
    </div>
  );
};

const ServiceCard = ({
  title,
  detail,
  color,
  delay,
}: {
  title: string;
  detail: string;
  color: string;
  delay: number;
}) => {
  const frame = useCurrentFrame();
  const progress = enter(frame, delay);

  return (
    <div
      style={{
        width: 250,
        minHeight: 166,
        borderRadius: 28,
        border: `1px solid ${palette.line}`,
        background: palette.panel,
        padding: 24,
        boxShadow: '0 18px 46px rgba(20, 55, 43, 0.1)',
        opacity: progress,
        transform: `translateY(${(1 - progress) * 46}px) scale(${0.94 + progress * 0.06})`,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 16,
          background: color,
          marginBottom: 18,
        }}
      />
      <p
        style={{
          margin: 0,
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          color: palette.ink,
          fontSize: 26,
          lineHeight: 1,
          fontWeight: 820,
        }}
      >
        {title}
      </p>
      <p
        style={{
          margin: '12px 0 0',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          color: palette.muted,
          fontSize: 17,
          lineHeight: 1.24,
          fontWeight: 620,
        }}
      >
        {detail}
      </p>
    </div>
  );
};

const SceneOne = () => {
  const frame = useCurrentFrame();
  const headline = Math.max(0.38, enter(frame, 0));
  const phone = Math.max(0.22, enter(frame, 10));

  return (
    <AbsoluteFill>
      <Background />
      <div style={{position: 'absolute', left: 92, top: 122, width: 610}}>
        <p style={{...eyebrow, opacity: Math.max(0.72, fade(frame, 0, 14))}}>
          WhatsApp-first public service automation
        </p>
        <h1
          style={{
            ...sceneTitle,
            marginTop: 22,
            opacity: headline,
            transform: `translateY(${(1 - headline) * 48}px)`,
          }}
        >
          Paperwork,
          <br />
          meet flow.
        </h1>
        <p
          style={{
            ...bodyText,
            marginTop: 28,
            width: 560,
            opacity: fade(frame, 30, 52),
          }}
        >
          One citizen profile moves across onboarding, documents, eligibility, forms,
          tracking, and proof.
        </p>
        <div style={{display: 'flex', gap: 14, marginTop: 34}}>
          <Pill label="Profile" color={palette.green} progress={fade(frame, 45, 62)} />
          <Pill label="Vault" color={palette.saffron} progress={fade(frame, 52, 68)} />
          <Pill label="Proof" color={palette.blue} progress={fade(frame, 59, 75)} />
        </div>
      </div>
      <div style={{position: 'absolute', right: 148, top: 72}}>
        <Drift x={20} y={12}>
          <PhoneFrame progress={phone} />
        </Drift>
      </div>
    </AbsoluteFill>
  );
};

const SceneTwo = () => {
  const frame = useCurrentFrame();
  const header = enter(frame, 4);
  const line = fade(frame, 34, 90);

  const steps = [
    ['OCR reads the document', palette.saffron],
    ['Profile fields sync once', palette.teal],
    ['Forms fill without retyping', palette.blue],
    ['Status stays trackable', palette.green],
  ];

  return (
    <AbsoluteFill>
      <Background />
      <div style={{position: 'absolute', left: 88, right: 88, top: 76}}>
        <p style={{...eyebrow, opacity: header}}>A service relay, not another form maze</p>
        <h2
          style={{
            ...sceneTitle,
            fontSize: 62,
            marginTop: 18,
            opacity: header,
            transform: `translateY(${(1 - header) * 30}px)`,
          }}
        >
          From document to done.
        </h2>
      </div>

      <div style={{position: 'absolute', left: 102, right: 102, top: 292}}>
        <div
          style={{
            position: 'absolute',
            left: 74,
            right: 74,
            top: 83,
            height: 8,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${palette.saffron}, ${palette.teal}, ${palette.blue}, ${palette.green})`,
            transformOrigin: 'left center',
            transform: `scaleX(${line})`,
          }}
        />
        <div style={{display: 'flex', justifyContent: 'space-between'}}>
          {steps.map(([label, color], index) => {
            const progress = enter(frame, 26 + index * 14);
            return (
              <div
                key={label}
                style={{
                  width: 220,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  opacity: progress,
                  transform: `translateY(${(1 - progress) * 36}px)`,
                }}
              >
                <div
                  style={{
                    width: 164,
                    height: 164,
                    borderRadius: 999,
                    background: palette.panel,
                    border: `1px solid ${palette.line}`,
                    boxShadow: softShadow,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 86,
                      height: 86,
                      borderRadius: 26,
                      background: color,
                      transform: `rotate(${frame * 0.4 + index * 18}deg)`,
                    }}
                  />
                </div>
                <p
                  style={{
                    margin: '22px 0 0',
                    color: palette.ink,
                    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                    fontSize: 25,
                    lineHeight: 1.08,
                    textAlign: 'center',
                    fontWeight: 800,
                  }}
                >
                  {label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SceneThree = () => {
  const frame = useCurrentFrame();
  const left = enter(frame, 2);

  return (
    <AbsoluteFill>
      <Background />
      <div style={{position: 'absolute', left: 90, top: 92, width: 460}}>
        <p style={{...eyebrow, opacity: left}}>Citizen side plus officer side</p>
        <h2
          style={{
            ...sceneTitle,
            fontSize: 60,
            marginTop: 20,
            opacity: left,
            transform: `translateY(${(1 - left) * 32}px)`,
          }}
        >
          The front door and the control room.
        </h2>
        <p style={{...bodyText, marginTop: 26, opacity: fade(frame, 26, 48)}}>
          GovBot connects guided applications with the dashboards needed to monitor
          disbursement, fraud flags, regions, and credentials.
        </p>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 92,
          top: 88,
          width: 570,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 22,
        }}
      >
        <ServiceCard
          title="Scholarships"
          detail="NSP, SSP, CSSS, PMSS, minority flows"
          color={palette.green}
          delay={18}
        />
        <ServiceCard
          title="Documents"
          detail="OCR, vault, signed links, passkey gate"
          color={palette.saffron}
          delay={28}
        />
        <ServiceCard
          title="Payouts"
          detail="Bank readiness and treasury release demos"
          color={palette.blue}
          delay={38}
        />
        <ServiceCard
          title="Credentials"
          detail="Wallet, QR proof, verification hooks"
          color={palette.rose}
          delay={48}
        />
      </div>
    </AbsoluteFill>
  );
};

const SceneFour = () => {
  const frame = useCurrentFrame();
  const headline = enter(frame, 8);
  const pulse = interpolate(Math.sin(frame / 12), [-1, 1], [0.9, 1.08]);

  return (
    <AbsoluteFill>
      <Background />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 118,
            height: 118,
            borderRadius: 34,
            background: palette.green,
            boxShadow: softShadow,
            display: 'grid',
            placeItems: 'center',
            transform: `scale(${pulse})`,
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 18,
              background: palette.lime,
            }}
          />
        </div>
        <h2
          style={{
            ...sceneTitle,
            marginTop: 34,
            fontSize: 76,
            opacity: headline,
            transform: `translateY(${(1 - headline) * 36}px)`,
          }}
        >
          One profile.
          <br />
          Many services.
        </h2>
        <p style={{...bodyText, width: 740, marginTop: 28, opacity: fade(frame, 34, 58)}}>
          Built with FastAPI, Next.js, LangGraph, Gemini, Supabase, Playwright,
          and a README that finally shows the whole route.
        </p>
        <div
          style={{
            marginTop: 38,
            display: 'flex',
            gap: 12,
            opacity: fade(frame, 56, 78),
          }}
        >
          {['Chat', 'Vault', 'Fill', 'Track', 'Verify'].map((item) => (
            <div
              key={item}
              style={{
                height: 48,
                padding: '0 22px',
                borderRadius: 999,
                background: palette.panel,
                border: `1px solid ${palette.line}`,
                display: 'flex',
                alignItems: 'center',
                color: palette.ink,
                fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                fontSize: 19,
                fontWeight: 790,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const GovBotShowcase = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const progress = frame / durationInFrames;

  return (
    <AbsoluteFill style={{background: palette.paper}}>
      <Sequence from={0} durationInFrames={96}>
        <SceneOne />
      </Sequence>
      <Sequence from={90} durationInFrames={100}>
        <SceneTwo />
      </Sequence>
      <Sequence from={184} durationInFrames={96}>
        <SceneThree />
      </Sequence>
      <Sequence from={274} durationInFrames={86}>
        <SceneFour />
      </Sequence>
      <div
        style={{
          position: 'absolute',
          left: 84,
          right: 84,
          bottom: 52,
          height: 6,
          borderRadius: 999,
          background: 'rgba(16, 32, 29, 0.1)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            borderRadius: 999,
            background: `linear-gradient(90deg, ${palette.green}, ${palette.saffron}, ${palette.blue})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
