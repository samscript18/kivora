"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BellRing,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleDollarSign,
  CloudSun,
  Command,
  Gauge,
  LockKeyhole,
  Menu,
  MessageSquareText,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const configured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
const nav = [
  { label: "Platform", href: "#platform" },
  { label: "Intelligence", href: "#intelligence" },
  { label: "Workflow", href: "#workflow" },
  { label: "Security", href: "#security" },
];

const ease = [0.16, 1, 0.3, 1] as const;
const reveal = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease } },
};

function WorkspaceLaunch({ className = "" }: { className?: string }) {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();
  return (
    <button
      disabled={!ready}
      onClick={() => (authenticated ? router.push("/dashboard") : login())}
      className={className}
    >
      {authenticated ? "Open workspace" : "Enter Kivora"}
      <ArrowRight size={15} />
    </button>
  );
}

function Launch({ className = "" }: { className?: string }) {
  if (!configured) {
    return (
      <button
        onClick={() => toast.error("Workspace sign-in is not configured yet.")}
        className={className}
      >
        Enter Kivora <ArrowRight size={15} />
      </button>
    );
  }
  return <WorkspaceLaunch className={className} />;
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 48);
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 md:pt-6">
        <motion.nav
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease }}
          className={`pointer-events-auto flex w-full max-w-6xl items-center justify-between rounded-full border px-4 py-2.5 backdrop-blur-2xl transition-all duration-500 ${scrolled ? "border-white/10 bg-[#09090b]/85 shadow-[0_20px_70px_rgba(0,0,0,.45)]" : "border-white/[.07] bg-white/[.025]"}`}
        >
          <Link href="#top" className="flex items-center gap-2.5 pl-1">
            <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-xl bg-white text-black">
              <motion.span
                className="absolute inset-0 bg-[conic-gradient(from_180deg,#ff1301,#f5b51b,#ff1301)]"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
              />
              <span className="relative grid h-[29px] w-[29px] place-items-center rounded-[10px] bg-[#08080a] font-display text-sm font-black text-white">
                K
              </span>
            </span>
            <span className="font-display text-[17px] font-bold tracking-[-.04em]">
              Kivora<span className="text-accent">°</span>
            </span>
          </Link>
          <div className="hidden items-center gap-1 lg:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 text-xs font-semibold text-white/45 transition hover:bg-white/[.05] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <Launch className="hidden items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-extrabold text-black transition hover:scale-[1.03] lg:flex" />
          <button
            aria-label="Toggle navigation"
            onClick={() => setOpen((value) => !value)}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 lg:hidden"
          >
            {open ? <X size={17} /> : <Menu size={17} />}
          </button>
        </motion.nav>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.98 }}
            className="fixed left-4 right-4 top-[76px] z-40 rounded-[24px] border border-white/10 bg-[#0c0c0f]/95 p-3 shadow-2xl backdrop-blur-2xl"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-2xl px-4 py-3 text-sm font-semibold text-white/55 hover:bg-white/[.05] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            <Launch className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-black" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Glow() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 45, damping: 20 });
  const springY = useSpring(y, { stiffness: 45, damping: 20 });
  useEffect(() => {
    const move = (event: PointerEvent) => {
      x.set(event.clientX - 250);
      y.set(event.clientY - 250);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [x, y]);
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute h-[500px] w-[500px] rounded-full bg-accent/10 blur-[120px]"
      style={{ x: springX, y: springY }}
    />
  );
}

function HeroConsole() {
  const priorities = [
    {
      rank: "01",
      label: "Pricing conflict",
      property: "Ocean House",
      impact: "$5.8k",
      color: "text-accent",
    },
    {
      rank: "02",
      label: "Demand surge",
      property: "Downtown Collection",
      impact: "+18%",
      color: "text-amber-300",
    },
    {
      rank: "03",
      label: "Booking pace",
      property: "North Shore",
      impact: "$2.1k",
      color: "text-emerald-300",
    },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 60, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay: 0.75, duration: 1.1, ease }}
      className="relative mx-auto mt-16 w-full max-w-5xl [perspective:1200px]"
    >
      <div className="absolute -inset-12 bg-[radial-gradient(circle,rgba(255,19,1,.16),transparent_65%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0d10]/90 shadow-[0_50px_140px_rgba(0,0,0,.8)] backdrop-blur-xl">
        <div className="flex items-center border-b border-white/[.07] px-5 py-4">
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
          <div className="mx-auto font-mono text-[9px] uppercase tracking-[.22em] text-white/25">
            Product interface preview
          </div>
          <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-wider text-emerald-400">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />{" "}
            Always on
          </div>
        </div>
        <div className="grid lg:grid-cols-[1.1fr_.9fr]">
          <div className="border-b border-white/[.07] p-5 sm:p-7 lg:border-b-0 lg:border-r">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.2em] text-white/30">
                  Portfolio health
                </p>
                <div className="mt-2 font-display text-5xl font-bold tracking-[-.06em]">
                  94<span className="text-lg text-white/25">/100</span>
                </div>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 font-mono text-[8px] uppercase text-emerald-300">
                Strong position
              </div>
            </div>
            <div className="mt-8 flex h-36 items-end gap-1.5">
              {Array.from({ length: 24 }, (_, index) => (
                <motion.span
                  key={index}
                  initial={{ height: 8 }}
                  animate={{
                    height: [
                      22 + (index % 5) * 8,
                      58 + ((index * 13) % 60),
                      28 + ((index * 7) % 70),
                    ],
                  }}
                  transition={{
                    duration: 4 + (index % 4),
                    repeat: Infinity,
                    repeatType: "mirror",
                    ease: "easeInOut",
                  }}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-accent/75 to-amber-300/30"
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ["Revenue", "$184.2k"],
                ["At risk", "$7.1k"],
                ["Opportunities", "06"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"
                >
                  <div className="font-mono text-[8px] uppercase text-white/25">
                    {label}
                  </div>
                  <div className="mt-1.5 text-sm font-bold">{value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5 sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.2em] text-accent">
                  Priority queue
                </p>
                <h3 className="mt-2 font-display text-xl font-bold">
                  What needs you now
                </h3>
              </div>
              <BellRing size={18} className="text-white/25" />
            </div>
            <div className="mt-6 space-y-2.5">
              {priorities.map((item, index) => (
                <motion.div
                  key={item.rank}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.15 + index * 0.14 }}
                  className="group flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3.5"
                >
                  <span className="font-mono text-[9px] text-white/20">
                    {item.rank}
                  </span>
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/[.05]">
                    <Zap size={14} className={item.color} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[11px]">{item.label}</b>
                    <small className="text-[9px] text-white/30">
                      {item.property}
                    </small>
                  </span>
                  <b className={`text-xs ${item.color}`}>{item.impact}</b>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-accent/15 bg-accent/[.04] p-3.5 text-[10px] text-white/45">
              <BrainCircuit size={15} className="text-accent" /> Portfolio
              signals continuously evaluated
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 180]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  return (
    <section
      id="top"
      ref={ref}
      className="relative min-h-[120vh] overflow-hidden pt-40"
    >
      <Glow />
      <div className="hero-orb absolute left-[8%] top-24 h-44 w-44 rounded-full border border-accent/20" />
      <div className="hero-orb-delayed absolute right-[8%] top-52 h-72 w-72 rounded-full border border-amber-300/10" />
      <div className="absolute inset-0 grid-pattern opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
      <motion.div
        style={{ y, opacity }}
        className="relative z-10 mx-auto max-w-7xl px-4 text-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-4 py-2 font-mono text-[9px] uppercase tracking-[.22em] text-white/45"
        >
          <Sparkles size={12} className="text-amber-300" /> Intelligence for
          every revenue decision
        </motion.div>
        <h1 className="mx-auto mt-8 max-w-6xl font-display text-[clamp(4.2rem,11vw,9.5rem)] font-semibold leading-[.82] tracking-[-.085em]">
          <motion.span
            initial={{ opacity: 0, y: 70 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease }}
            className="block"
          >
            See the signal.
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 70 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.12, ease }}
            className="text-gradient block"
          >
            Make the move.
          </motion.span>
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mx-auto mt-8 max-w-2xl text-base leading-8 text-white/45 sm:text-lg"
        >
          Kivora turns a noisy rental portfolio into one calm, ranked operating
          system—showing your team what changed, what it costs, and what to do
          next.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Launch className="flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-extrabold text-black shadow-[0_18px_55px_rgba(255,255,255,.12)] transition hover:scale-[1.03]" />
          <Link
            href="#platform"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-8 py-4 text-sm font-bold text-white/65 transition hover:bg-white/[.08] hover:text-white"
          >
            Explore the platform <ArrowRight size={15} />
          </Link>
        </motion.div>
        <HeroConsole />
      </motion.div>
    </section>
  );
}

function SignalRail() {
  const signals = [
    "Pricing drift detected",
    "Demand spike approaching",
    "Booking pace below market",
    "Owner brief ready",
    "Portfolio health improved",
    "Strategy preview complete",
  ];
  return (
    <div className="relative overflow-hidden border-y border-white/[.06] bg-white/[.018] py-4">
      <div className="signal-marquee flex w-max items-center">
        {[...signals, ...signals].map((signal, index) => (
          <div
            key={`${signal}-${index}`}
            className="flex items-center gap-5 px-6 font-mono text-[9px] uppercase tracking-[.2em] text-white/30"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {signal}
          </div>
        ))}
      </div>
    </div>
  );
}

function Problem() {
  return (
    <section className="relative py-32 sm:py-40">
      <div className="mx-auto grid max-w-7xl gap-16 px-4 lg:grid-cols-[.8fr_1.2fr]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <p className="eyebrow">The hidden tax of noise</p>
          <h2 className="mt-5 font-display text-4xl font-semibold leading-[.95] tracking-[-.06em] sm:text-6xl">
            More dashboards.
            <br />
            <span className="text-white/25">Less clarity.</span>
          </h2>
        </motion.div>
        <div className="grid gap-px overflow-hidden rounded-[28px] border border-white/[.07] bg-white/[.07] sm:grid-cols-2">
          {[
            ["08:04", "A pricing override quietly blocks your best rates."],
            [
              "10:17",
              "A nearby event starts moving demand before bookings show it.",
            ],
            [
              "13:42",
              "One market falls behind pace while the portfolio average looks fine.",
            ],
            [
              "17:30",
              "The team finds the leak—hours after the opportunity moved on.",
            ],
          ].map(([time, text], index) => (
            <motion.article
              key={time}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.12 }}
              className="bg-[#0a0a0c] p-7 sm:p-9"
            >
              <div className="font-mono text-[10px] text-accent">{time}</div>
              <p className="mt-8 text-lg leading-8 text-white/60">{text}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: Radar,
    title: "Always-on audits",
    text: "Every listing is continuously checked for pricing conflicts, pace anomalies, configuration drift, and lost upside.",
    className: "md:col-span-2",
  },
  {
    icon: BrainCircuit,
    title: "Explainable intelligence",
    text: "Every recommendation carries a reason, evidence, impact estimate, and confidence score.",
    className: "",
  },
  {
    icon: CloudSun,
    title: "Demand before bookings",
    text: "Local events and weather shifts become portfolio-level signals before the market reacts.",
    className: "",
  },
  {
    icon: BarChart3,
    title: "Strategy lab",
    text: "Compare conservative, balanced, and aggressive outcomes before committing to a direction.",
    className: "md:col-span-2",
  },
  {
    icon: MessageSquareText,
    title: "Owner-ready narrative",
    text: "Turn operational changes into concise reports your owners can understand and trust.",
    className: "",
  },
];

function Platform() {
  return (
    <section
      id="platform"
      className="relative overflow-hidden border-y border-white/[.06] bg-[#0d0d10] py-32"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_30%,rgba(255,19,1,.09),transparent_35%),radial-gradient(circle_at_85%_70%,rgba(234,179,8,.06),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-4">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="max-w-3xl"
        >
          <p className="eyebrow">The platform</p>
          <h2 className="mt-5 font-display text-4xl font-semibold leading-[.95] tracking-[-.06em] sm:text-7xl">
            Everything your revenue team needs to move first.
          </h2>
          <p className="mt-7 max-w-xl text-base leading-8 text-white/40">
            Not another place to inspect charts. A focused operating layer that
            turns portfolio movement into decisions.
          </p>
        </motion.div>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, title, text, className }, index) => (
            <motion.article
              key={title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: index * 0.07, duration: 0.7, ease }}
              whileHover={{ y: -6 }}
              className={`feature-card group relative min-h-[310px] overflow-hidden rounded-[28px] border border-white/[.08] bg-white/[.025] p-7 ${className}`}
            >
              <div className="absolute right-[-35px] top-[-35px] h-40 w-40 rounded-full bg-accent/[.04] blur-2xl transition group-hover:bg-accent/[.1]" />
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[.04] text-accent">
                <Icon size={20} />
              </span>
              <div className="absolute bottom-7 left-7 right-7">
                <div className="font-mono text-[9px] uppercase tracking-[.18em] text-white/20">
                  0{index + 1}
                </div>
                <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-.035em]">
                  {title}
                </h3>
                <p className="mt-3 max-w-lg text-sm leading-7 text-white/38">
                  {text}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Intelligence() {
  const rows = [
    {
      icon: CircleDollarSign,
      name: "Revenue risk",
      value: "$5,820",
      note: "3-night exposure",
      tone: "text-accent",
    },
    {
      icon: TrendingUp,
      name: "Market momentum",
      value: "+18.4%",
      note: "demand acceleration",
      tone: "text-amber-300",
    },
    {
      icon: Gauge,
      name: "Confidence",
      value: "97%",
      note: "verified evidence",
      tone: "text-emerald-300",
    },
  ];
  return (
    <section id="intelligence" className="relative py-32 sm:py-40">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease }}
          className="relative"
        >
          <div className="absolute -inset-20 bg-[radial-gradient(circle,rgba(255,19,1,.1),transparent_60%)] blur-xl" />
          <div className="relative rounded-[32px] border border-white/[.09] bg-[#101014] p-5 shadow-[0_40px_100px_rgba(0,0,0,.6)] sm:p-8">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[.2em] text-white/25">
                Priority intelligence
              </span>
              <span className="flex items-center gap-2 font-mono text-[8px] text-emerald-300">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />{" "}
                VERIFIED
              </span>
            </div>
            <div className="mt-8 rounded-[24px] border border-accent/20 bg-accent/[.045] p-6">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent">
                  <Zap size={20} />
                </span>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-accent">
                    Priority #1
                  </div>
                  <h3 className="mt-2 font-display text-2xl font-semibold">
                    Restore dynamic pricing
                  </h3>
                  <p className="mt-2 text-xs leading-6 text-white/35">
                    A manual rate is blocking the current strategy across a
                    high-demand weekend.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {rows.map(({ icon: Icon, name, value, note, tone }) => (
                <div
                  key={name}
                  className="flex items-center gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[.04]">
                    <Icon size={16} className={tone} />
                  </span>
                  <span className="flex-1">
                    <b className="block text-xs">{name}</b>
                    <small className="text-[9px] text-white/25">{note}</small>
                  </span>
                  <strong className={`font-display text-lg ${tone}`}>
                    {value}
                  </strong>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="rounded-2xl border border-white/10 py-3 text-xs font-bold text-white/50">
                Review evidence
              </button>
              <button className="rounded-2xl bg-white py-3 text-xs font-extrabold text-black">
                Preview action
              </button>
            </div>
          </div>
        </motion.div>
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <p className="eyebrow">Decision intelligence</p>
          <h2 className="mt-5 font-display text-4xl font-semibold leading-[.96] tracking-[-.06em] sm:text-6xl">
            A recommendation is only useful when you can trust it.
          </h2>
          <p className="mt-7 max-w-xl text-base leading-8 text-white/42">
            Kivora connects every action to the operating facts behind it. Your
            team sees the cause, the exposure, the confidence, and the safest
            next step before anything changes.
          </p>
          <div className="mt-9 space-y-4">
            {[
              "Measured facts stay separate from estimates",
              "Every proposed change can be previewed",
              "High-impact actions always require approval",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 text-sm text-white/60"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-400/10 text-emerald-300">
                  <Check size={13} />
                </span>
                {item}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

const steps = [
  {
    number: "01",
    title: "Watch",
    text: "Kivora monitors portfolio performance and external demand around the clock.",
  },
  {
    number: "02",
    title: "Prioritize",
    text: "Signals are ranked by urgency, confidence, and financial impact.",
  },
  {
    number: "03",
    title: "Preview",
    text: "Your team sees the projected outcome before committing to a change.",
  },
  {
    number: "04",
    title: "Approve",
    text: "A trusted operator reviews and authorizes the exact action.",
  },
  {
    number: "05",
    title: "Verify",
    text: "The result is checked, recorded, and translated into a clear update.",
  },
];

function Workflow() {
  return (
    <section
      id="workflow"
      className="relative overflow-hidden border-y border-white/[.06] bg-[#0d0d10] py-32"
    >
      <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-accent to-transparent" />
      <div className="mx-auto max-w-7xl px-4">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center"
        >
          <p className="eyebrow">The operating loop</p>
          <h2 className="mx-auto mt-5 max-w-4xl font-display text-4xl font-semibold leading-[.95] tracking-[-.06em] sm:text-7xl">
            From invisible problem to verified action.
          </h2>
        </motion.div>
        <div className="relative mt-20 grid gap-4 lg:grid-cols-5">
          <div className="absolute left-[10%] right-[10%] top-8 hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent lg:block" />
          {steps.map((step, index) => (
            <motion.article
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.12 }}
              className="relative rounded-[24px] border border-white/[.07] bg-[#101014] p-6 lg:border-0 lg:bg-transparent lg:p-4"
            >
              <span className="relative z-10 grid h-16 w-16 place-items-center rounded-full border border-white/10 bg-[#0d0d10] font-mono text-[10px] text-accent shadow-[0_0_0_8px_#0d0d10]">
                {step.number}
              </span>
              <h3 className="mt-8 font-display text-2xl font-semibold">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/35">
                {step.text}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function MobileCompanion() {
  return (
    <section className="relative overflow-hidden py-32 sm:py-40">
      <div className="absolute right-0 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-amber-300/[.05] blur-[130px]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 lg:grid-cols-[1fr_.8fr]">
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <p className="eyebrow">Revenue operations, anywhere</p>
          <h2 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[.96] tracking-[-.06em] sm:text-7xl">
            Your morning briefing already knows what matters.
          </h2>
          <p className="mt-7 max-w-xl text-base leading-8 text-white/42">
            Get the portfolio pulse, ask a question, preview a recommendation,
            or approve a trusted action without being chained to another
            dashboard.
          </p>
          <div className="mt-9 flex flex-wrap gap-2">
            {[
              "Daily briefings",
              "Real-time alerts",
              "Natural-language answers",
              "Secure approvals",
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-white/[.025] px-4 py-2 text-[10px] font-bold text-white/40"
              >
                {item}
              </span>
            ))}
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 50, rotate: 4 }}
          whileInView={{ opacity: 1, y: 0, rotate: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease }}
          className="relative mx-auto w-full max-w-[370px]"
        >
          <div className="absolute -inset-16 bg-[radial-gradient(circle,rgba(234,179,8,.13),transparent_62%)] blur-xl" />
          <div className="relative rounded-[42px] border border-white/15 bg-[#111116] p-3 shadow-[0_45px_120px_rgba(0,0,0,.75)]">
            <div className="overflow-hidden rounded-[32px] bg-[#08080a]">
              <div className="flex items-center border-b border-white/[.07] p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-accent to-amber-400">
                  <Bot size={17} />
                </span>
                <span className="ml-3">
                  <b className="block text-xs">Kivora</b>
                  <small className="text-[9px] text-emerald-300">
                    sample briefing
                  </small>
                </span>
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </div>
              <div className="space-y-4 p-5">
                <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white/[.06] p-4 text-xs leading-6 text-white/55">
                  Good morning, Emma. Your portfolio health is{" "}
                  <b className="text-white">95/100</b>. Two actions need your
                  attention today.
                </div>
                <div className="rounded-2xl border border-accent/15 bg-accent/[.045] p-4">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-accent">
                    Highest impact
                  </div>
                  <div className="mt-2 text-sm font-bold">
                    Pricing override detected
                  </div>
                  <div className="mt-1 text-[10px] text-white/30">
                    Ocean House · $5,820 at risk
                  </div>
                  <button className="mt-4 w-full rounded-xl bg-white py-2.5 text-[10px] font-extrabold text-black">
                    Open priority
                  </button>
                </div>
                <div className="ml-auto max-w-[75%] rounded-2xl rounded-tr-sm bg-accent p-3 text-xs">
                  Why is this urgent?
                </div>
                <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white/[.06] p-4 text-xs leading-6 text-white/55">
                  Weekend demand accelerated while the manual rate stayed fixed.
                  The current gap is 76%.
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section
      id="security"
      className="border-y border-white/[.06] bg-[#0d0d10] py-32"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid gap-12 lg:grid-cols-2">
          <motion.div
            variants={reveal}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <p className="eyebrow">Built for trust</p>
            <h2 className="mt-5 font-display text-4xl font-semibold leading-[.96] tracking-[-.06em] sm:text-6xl">
              Automation with a seatbelt.
            </h2>
            <p className="mt-7 max-w-lg text-base leading-8 text-white/42">
              Kivora moves quickly where it should and stops exactly where human
              judgment matters.
            </p>
          </motion.div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [
                LockKeyhole,
                "Private by design",
                "Sensitive credentials never enter the browser.",
              ],
              [
                ShieldCheck,
                "Approval gated",
                "Meaningful changes require an authorized operator.",
              ],
              [
                Activity,
                "Fully traceable",
                "Every action records who, what, when, and the verified result.",
              ],
              [
                Command,
                "No invented data",
                "Unavailable sources stay unavailable—never silently replaced.",
              ],
            ].map(([Icon, title, text], index) => {
              const I = Icon as typeof LockKeyhole;
              return (
                <motion.article
                  key={String(title)}
                  initial={{ opacity: 0, scale: 0.96 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                  className="rounded-[24px] border border-white/[.07] bg-white/[.025] p-6"
                >
                  <I size={19} className="text-accent" />
                  <h3 className="mt-6 font-display text-lg font-semibold">
                    {String(title)}
                  </h3>
                  <p className="mt-2 text-xs leading-6 text-white/35">
                    {String(text)}
                  </p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

const questions = [
  [
    "Does Kivora change prices automatically?",
    "No high-impact change happens invisibly. Your team reviews the evidence and preview, then an authorized operator approves the exact action.",
  ],
  [
    "Is this another analytics dashboard?",
    "No. Kivora is built around a ranked action queue. Analytics support the decision instead of becoming another place to search.",
  ],
  [
    "Can it handle multiple portfolios?",
    "Yes. Teams can organize and monitor multiple portfolio segments from a single operating workspace.",
  ],
  [
    "What happens when a data source is unavailable?",
    "Kivora reports the unavailable source and blocks dependent actions. It never inserts synthetic portfolio data.",
  ],
  [
    "Can my team operate from mobile?",
    "Yes. Each team member can securely connect their own mobile conversation and receive personalized alerts, briefings, and allowed actions.",
  ],
];

function FAQ() {
  const [active, setActive] = useState<number | null>(0);
  return (
    <section className="py-32 sm:py-40">
      <div className="mx-auto grid max-w-7xl gap-16 px-4 lg:grid-cols-[.7fr_1.3fr]">
        <div>
          <p className="eyebrow">Questions, answered</p>
          <h2 className="mt-5 font-display text-4xl font-semibold tracking-[-.06em] sm:text-6xl">
            The important things, clearly.
          </h2>
        </div>
        <div className="border-t border-white/[.08]">
          {questions.map(([question, answer], index) => (
            <div key={question} className="border-b border-white/[.08]">
              <button
                onClick={() => setActive(active === index ? null : index)}
                className="flex w-full items-center py-6 text-left"
              >
                <span className="font-display text-lg font-semibold sm:text-xl">
                  {question}
                </span>
                <motion.span
                  animate={{ rotate: active === index ? 180 : 0 }}
                  className="ml-auto"
                >
                  <ChevronDown size={18} className="text-white/30" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {active === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="max-w-2xl pb-7 text-sm leading-7 text-white/38">
                      {answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <footer className="relative overflow-hidden border-t border-white/[.06]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,19,1,.25),transparent_45%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-32 text-center sm:py-44">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease }}
        >
          <p className="eyebrow">Your next best move is waiting</p>
          <h2 className="mx-auto mt-6 max-w-6xl font-display text-[clamp(3.6rem,9vw,8.5rem)] font-semibold leading-[.84] tracking-[-.085em]">
            Run revenue.
            <br />
            <span className="text-gradient">Not reports.</span>
          </h2>
          <p className="mx-auto mt-8 max-w-xl text-base leading-8 text-white/40">
            Turn every signal into a clear priority, every priority into a
            confident action, and every action into a result you can prove.
          </p>
          <Launch className="mx-auto mt-10 flex items-center gap-2 rounded-full bg-white px-9 py-4 text-sm font-extrabold text-black transition hover:scale-[1.04]" />
        </motion.div>
      </div>
      <div className="relative border-t border-white/[.06] px-4 py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-[10px] text-white/25 sm:flex-row">
          <Link
            href="#top"
            className="font-display text-lg font-bold tracking-[-.04em] text-white"
          >
            Kivora<span className="text-accent">°</span>
          </Link>
          <span className="font-mono uppercase tracking-[.18em]">
            Revenue, on watch.
          </span>
          <span>© {new Date().getFullYear()} Kivora</span>
        </div>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <main className="landing-page">
      <Navbar />
      <Hero />
      <SignalRail />
      <Problem />
      <Platform />
      <Intelligence />
      <Workflow />
      <MobileCompanion />
      <Security />
      <FAQ />
      <FinalCTA />
    </main>
  );
}
