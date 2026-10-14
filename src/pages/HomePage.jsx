import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AUDIO_TYPES } from '../constants/audioTypes';
import { Backdrop, SectionHeading } from '../components/art/Layout';
import {
  AudioTypeArt, ChatArt, FeatureIcon, FlowchartArt, HeroScene, UseCaseArt, Waveform
} from '../components/art/Illustrations';

const features = [
  { icon: 'transcript', tone: 'cyan', title: 'Accurate Transcription', copy: 'Whisper turns speech into a timestamped, searchable transcript you can download.' },
  { icon: 'speakers', tone: 'amber', title: 'Speaker Detection', copy: 'Works out how many people spoke, who they are, and how much each one contributed.' },
  { icon: 'flowchart', tone: 'brand', title: 'Concept Flowcharts', copy: 'A clean keyword tree of the core idea, themes, metrics, decisions and speakers.' },
  { icon: 'evaluation', tone: 'green', title: 'Flowchart Evaluation', copy: 'Nine metrics check coverage, groundedness and structure — refined until the tree is valid.' },
  { icon: 'chatbot', tone: 'pink', title: 'Audio Chatbot', copy: 'Ask for summaries, who said what, numbers or decisions — answered with [mm:ss] timestamps.' },
  { icon: 'history', tone: 'cyan', title: 'History That Follows You', copy: 'Every flowchart and chat is saved — leave the page and pick up exactly where you left off.' }
];

const steps = [
  { icon: 'types', title: 'Choose audio type', copy: 'Interview, minutes of meeting, discussion, conversation or other audio.' },
  { icon: 'upload', title: 'Upload', copy: 'Drop a recording — speakers are detected automatically.' },
  { icon: 'output', title: 'Pick an output', copy: 'An evaluated concept flowchart, or a chatbot for your questions.' },
  { icon: 'explore', title: 'Explore & save', copy: 'Switch between flowchart, chat and transcript; save to Reports.' }
];

const pipeline = ['Record', 'Transcribe', 'Identify speakers', 'Extract key points', 'Flowchart or chat'];

const stats = [
  { icon: 'types', value: '5', label: 'Audio types' },
  { icon: 'output', value: '2', label: 'Output modes' },
  { icon: 'evaluation', value: '9', label: 'Evaluation metrics' },
  { icon: 'clock', value: '∞', label: 'No recording length limit' }
];

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' }
};

export default function HomePage() {
  return (
    <main className="relative isolate overflow-x-clip bg-bg-primary">
      <Backdrop />

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-10 pt-16 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:px-8 lg:pt-24">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-surface px-4 py-2 text-sm font-semibold text-text-secondary">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aura-cyan opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-aura-cyan" />
            </span>
            AI audio intelligence
          </div>
          <h1 className="mt-7 font-display text-5xl font-bold leading-[1.05] text-text-primary sm:text-7xl">
            Your Voice.{' '}
            <span className="text-gradient">Visualized. Instantly.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-text-secondary">
            Upload an interview, meeting, discussion or conversation. AuraSync transcribes it, works out who spoke, and turns it into an evaluated concept flowchart or a chatbot you can question.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/lab" className="gradient-button w-full justify-center px-7 sm:w-auto">
              Open Audio Lab
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
            <Link to="/reports" className="rounded-2xl border border-border bg-bg-surface px-6 py-4 text-center font-bold text-text-primary transition hover:scale-105">
              View Reports
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-text-secondary">
            {['Speaker-labelled transcript', 'Evaluated flowcharts', 'Timestamped answers'].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-success" fill="none" aria-hidden="true"><path d="m5 12 4 4 10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {item}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }}>
          <HeroScene className="mx-auto h-auto w-full max-w-[600px]" />
        </motion.div>
      </section>

      {/* Pipeline strip */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="glass-card relative overflow-hidden rounded-3xl px-6 py-6 shadow-aura">
          <Waveform bars={120} height={60} className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]" />
          <ol className="relative flex flex-wrap items-center justify-center gap-3">
            {pipeline.map((stage, index) => (
              <li key={stage} className="flex items-center gap-3">
                <span className="flex items-center gap-2 rounded-full border border-border bg-bg-surface px-4 py-2 text-sm font-bold text-text-primary">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-aura-violet to-aura-cyan text-xs text-white">{index + 1}</span>
                  {stage}
                </span>
                {index < pipeline.length - 1 && (
                  <svg viewBox="0 0 40 12" className="hidden h-3 w-10 md:block" aria-hidden="true"><path d="M0 6h34m-6-5 6 5-6 5" stroke="var(--text-muted)" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Audio types */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Audio types" title="Tailored to what you recorded" description="Each type tells the AI what matters: questions and answers in an interview, decisions and owners in a meeting, viewpoints in a discussion." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {AUDIO_TYPES.map((type, index) => (
            <motion.div key={type.id} {...fadeUp} transition={{ delay: index * 0.06 }}>
              <Link to="/lab" className="glass-card card-lift flex h-full flex-col rounded-3xl p-4 shadow-aura">
                <AudioTypeArt type={type.id} className="h-auto w-full" />
                <h3 className="mt-4 font-display text-lg font-bold text-text-primary">{type.label}</h3>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{type.description}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Outputs */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Two ways to understand it" title="Flowchart or chatbot — both saved in your history" tone="violet" />
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            {
              art: <FlowchartArt className="h-auto w-full" />,
              icon: 'flowchart',
              title: 'Concept Flowchart',
              points: ['Core idea → themes → keywords and metrics', 'Every node attributed to its speakers', 'Scored by 9 metrics and an LLM judge — refined until valid', 'Zoom, download as PNG, save to Reports']
            },
            {
              art: <ChatArt className="h-auto w-full" />,
              icon: 'chatbot',
              title: 'Audio Chatbot',
              points: ['“Summarise this”, “who said what”, “what numbers came up?”', 'Answers only from the recording, with timestamps', 'Remembers the conversation and follow-up questions', 'Pick up any chat again from your history']
            }
          ].map((card, index) => (
            <motion.div key={card.title} {...fadeUp} transition={{ delay: index * 0.1 }} className="glass-card card-lift overflow-hidden rounded-[2rem] shadow-aura">
              <div className="border-b border-border bg-bg-elevated p-6">{card.art}</div>
              <div className="p-7">
                <div className="flex items-center gap-4">
                  <FeatureIcon name={card.icon} tone={index ? 'pink' : 'brand'} />
                  <h3 className="font-display text-2xl font-bold text-text-primary">{card.title}</h3>
                </div>
                <ul className="mt-5 space-y-3">
                  {card.points.map((point) => (
                    <li key={point} className="flex gap-3 leading-7 text-text-secondary">
                      <svg viewBox="0 0 24 24" className="mt-1.5 h-4 w-4 shrink-0 text-aura-cyan-light" fill="none" aria-hidden="true"><path d="m5 12 4 4 10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="What AuraSync does" title="From raw audio to answers and visuals" />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div key={feature.title} {...fadeUp} transition={{ delay: index * 0.06 }} className="glass-card card-lift rounded-3xl p-6">
              <FeatureIcon name={feature.icon} tone={feature.tone} />
              <h3 className="mt-5 font-display text-xl font-bold text-text-primary">{feature.title}</h3>
              <p className="mt-3 leading-7 text-text-secondary">{feature.copy}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="glass-card relative overflow-hidden rounded-[2rem] p-6 shadow-aura sm:p-10">
          <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-aura-violet/20 blur-3xl" />
          <SectionHeading eyebrow="How it works" title="Four steps to clarity" tone="violet" />
          <div className="relative grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="absolute left-[12%] right-[12%] top-12 hidden h-0.5 bg-gradient-to-r from-aura-violet via-aura-cyan to-emerald-500 opacity-60 xl:block" />
            {steps.map((step, index) => (
              <motion.div key={step.title} {...fadeUp} transition={{ delay: index * 0.08 }} className="relative text-center">
                <div className="relative mx-auto w-fit">
                  <FeatureIcon name={step.icon} className="h-24 w-24 rounded-3xl" iconClassName="h-10 w-10" tone={['brand', 'cyan', 'pink', 'green'][index]} />
                  <span className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full border-2 border-bg-primary bg-bg-surface font-display text-sm font-bold text-text-primary">{index + 1}</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-text-primary">{step.title}</h3>
                <p className="mt-2 leading-7 text-text-secondary">{step.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <motion.div key={stat.label} {...fadeUp} transition={{ delay: index * 0.06 }} className="glass-card card-lift flex items-center gap-4 rounded-3xl p-6 shadow-aura">
              <FeatureIcon name={stat.icon} tone={['brand', 'pink', 'green', 'amber'][index]} />
              <div>
                <p className="font-display text-4xl font-bold text-gradient">{stat.value}</p>
                <p className="text-sm font-semibold text-text-secondary">{stat.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {['MP3', 'WAV', 'M4A', 'OGG', 'FLAC', 'WEBM', 'MP4'].map((format) => (
            <span key={format} className="rounded-full border border-border bg-bg-surface px-5 py-2.5 text-sm font-bold text-text-secondary">{format}</span>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
        {[
          { kind: 'education', icon: 'education', eyebrow: 'Education', title: 'Lectures and discussions, mapped', copy: 'Turn lectures and class discussions into concept flowcharts of the key ideas, then ask the chatbot to explain or summarise any part — with timestamps back to the recording.' },
          { kind: 'enterprise', icon: 'enterprise', eyebrow: 'Enterprise', title: 'Minutes and interviews, done for you', copy: 'Get minutes of meetings with decisions and owners, interview takeaways per question, and answers to “what did we agree on?” without replaying the call.' }
        ].map((useCase, index) => (
          <motion.div key={useCase.kind} {...fadeUp} transition={{ delay: index * 0.1 }} className="glass-card card-lift overflow-hidden rounded-[2rem] shadow-aura">
            <div className="bg-bg-elevated px-8 pt-8">
              <UseCaseArt kind={useCase.kind} className="mx-auto h-auto w-full max-w-md" />
            </div>
            <div className="p-8">
              <div className="flex items-center gap-3">
                <FeatureIcon name={useCase.icon} className="h-10 w-10 rounded-xl" iconClassName="h-5 w-5" tone={index ? 'amber' : 'cyan'} />
                <p className="text-sm font-bold uppercase tracking-[0.28em] text-aura-violet-light">{useCase.eyebrow}</p>
              </div>
              <h3 className="mt-4 font-display text-3xl font-bold text-text-primary">{useCase.title}</h3>
              <p className="mt-4 leading-8 text-text-secondary">{useCase.copy}</p>
            </div>
          </motion.div>
        ))}
      </section>

      {/* Call to action */}
      <section className="mx-auto max-w-7xl px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <motion.div {...fadeUp} className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-aura-violet to-aura-cyan p-10 text-center shadow-glow sm:p-14">
          <Waveform bars={80} height={80} className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-25" />
          <h2 className="relative font-display text-4xl font-bold text-white sm:text-5xl">Have a recording waiting?</h2>
          <p className="relative mx-auto mt-4 max-w-2xl text-lg leading-8 text-white/85">
            Pick its type, upload it, and get a flowchart or a chatbot in minutes.
          </p>
          <Link to="/lab" className="relative mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-4 font-bold text-aura-violet shadow-aura transition hover:scale-105">
            Start in Audio Lab
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
