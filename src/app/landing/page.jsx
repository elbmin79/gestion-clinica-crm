'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight, ChevronDown } from 'lucide-react';
import './landing.css';

const WHATSAPP = 'https://wa.me/5216863086854?text=' + encodeURIComponent('Hola, quiero agendar una cita en Elixir Clinic.');

const services = [
  ['Faciales', 'Limpieza facial, Dermapen e Hydrafacial.'],
  ['Corporales', 'Drenaje linfático, masajes y tratamientos corporales.'],
  ['Depilación láser', 'Sesiones para rostro y cuerpo por zona.'],
  ['Inyectables', 'Toxina botulínica, rellenos y Sculptra.'],
  ['Sueroterapia y lipoláser', 'Sueroterapia y valoración para lipoláser.'],
  ['Consultas', 'Primera valoración, seguimiento y consulta capilar.'],
];

const branches = [
  { short: 'Macristy', name: 'Sucursal Macristy', address: 'Calz. Macristy #916, Local 3, Mexicali', hours: 'Lunes a viernes de 11:00 a.m. a 7:00 p.m. Sábados de 9:00 a.m. a 2:00 p.m.', phone: '686 308 6854', tel: '+526863086854' },
  { short: 'Zaragoza', name: 'Sucursal Zaragoza', address: 'Av. Zaragoza #1769, Col. Nueva. Dentro de Centro Médico Vital', hours: 'Lunes a viernes de 10:00 a.m. a 6:00 p.m. Sábados de 9:00 a.m. a 2:00 p.m.', phone: '686 308 6854', tel: '+526863086854' },
];

function LogoSwitch() {
  const [open, setOpen] = useState(false);
  return <div className="landing-switch">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <img src="/elixirclinic-logo-dark.png" alt="" width="1374" height="1145" />
      <span className="landing-wordmark">Elixir Clinic</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    <div className="landing-switch-menu" data-open={open} inert={!open} aria-hidden={!open}>
      <Link href="/" onClick={() => setOpen(false)}>CRM</Link>
      <a href="#inicio" onClick={() => setOpen(false)}>Landing</a>
    </div>
  </div>;
}

function BranchBadges() {
  const [open, setOpen] = useState('');
  const hovered = useRef(false);
  return <div className="landing-badges">
    {branches.map(branch => <div key={branch.short} className="landing-badge" onMouseEnter={() => { hovered.current = true; setOpen(branch.short); }} onMouseLeave={() => { hovered.current = false; setOpen(''); }}>
      <button type="button" aria-expanded={open === branch.short} onClick={() => setOpen(current => current === branch.short && !hovered.current ? '' : branch.short)}>{branch.short}</button>
      <div className="landing-badge-card" data-open={open === branch.short} inert={open !== branch.short}>
        <strong>{branch.name}</strong>
        <p>{branch.address}</p>
        <p>{branch.hours}</p>
        <a href={`tel:${branch.tel}`}>{branch.phone}</a>
      </div>
    </div>)}
  </div>;
}

function keepPlaying(video) {
  if (!video) return () => {};
  video.muted = true;
  video.defaultMuted = true;
  const kick = () => { if (video.paused) video.play().catch(() => {}); };
  kick();
  video.addEventListener('loadeddata', kick);
  video.addEventListener('canplay', kick);
  document.addEventListener('pointerdown', kick);
  return () => {
    video.removeEventListener('loadeddata', kick);
    video.removeEventListener('canplay', kick);
    document.removeEventListener('pointerdown', kick);
  };
}

function HeroReel() {
  const ref = useRef(null);
  useEffect(() => keepPlaying(ref.current), []);
  return <div className="landing-hero-media">
    <video ref={ref} autoPlay muted loop playsInline preload="auto" poster="/landing/still-3.jpg">
      <source src="/landing/hero.mp4" type="video/mp4" />
    </video>
    <div className="landing-hero-shade" />
  </div>;
}

function LoopVideo({ src, poster, label, className }) {
  const ref = useRef(null);
  useEffect(() => keepPlaying(ref.current), [src]);
  return <video ref={ref} className={className} autoPlay muted loop playsInline preload="auto" poster={poster} aria-label={label}>
    <source src={src} type="video/mp4" />
  </video>;
}

function goToServices(event) {
  event.preventDefault();
  const target = document.getElementById('servicios');
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - 108;
  const start = window.scrollY;
  const distance = top - start;
  const duration = 280;
  const began = performance.now();
  const step = now => {
    const progress = Math.min(1, (now - began) / duration);
    const eased = 1 - (1 - progress) ** 3;
    window.scrollTo(0, start + distance * eased);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function LandingPage() {
  return <main className="clinic-landing" id="inicio">
    <header className="landing-top">
      <LogoSwitch />
      <BranchBadges />
    </header>
    <section className="landing-hero">
      <HeroReel />
      <div className="landing-hero-copy">
        <h1>Medicina estética <span>en Mexicali</span></h1>
        <p>Elixir Clinic</p>
        <div className="landing-hero-actions">
          <a className="landing-wa" href={WHATSAPP} target="_blank" rel="noreferrer">Agendar cita <ArrowUpRight size={22} aria-hidden="true" /></a>
          <a className="landing-services" href="#servicios" onClick={goToServices}>Ver servicios <ArrowDown size={22} aria-hidden="true" /></a>
        </div>
      </div>
    </section>
    <div className="landing-below">
      <section className="landing-story landing-shell" aria-labelledby="landing-story-title">
        <div className="landing-story-copy">
          <h2 id="landing-story-title">Valoración, tratamiento <em>y seguimiento</em></h2>
          <p>Faciales, corporales, láser e inyectables en un mismo expediente de cuidado.</p>
          <a className="landing-inline-link" href="#servicios" onClick={goToServices}>Explorar tratamientos <ArrowDown size={16} aria-hidden="true" /></a>
        </div>
        <LoopVideo src="/landing/clip-1.mp4" poster="/landing/still-3.jpg" label="Video de Elixir Clinic" />
      </section>
      <section id="servicios" className="landing-service-overview" aria-labelledby="landing-services-title">
        <div className="landing-shell landing-services-layout">
          <div className="landing-services-content">
            <h2 id="landing-services-title">Tratamientos</h2>
            <dl>
              {services.map(([name, description]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
            <a className="landing-services-book" href={WHATSAPP} target="_blank" rel="noreferrer">
              Agendar una valoración <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
          <LoopVideo className="landing-services-photo" src="/landing/clip-2.mp4" poster="/landing/still-2.jpg" label="Tratamiento en Elixir Clinic" />
        </div>
      </section>
      <section id="sucursales" className="landing-locations" aria-labelledby="landing-locations-title">
        <div className="landing-shell">
          <header className="landing-locations-head">
            <h2 id="landing-locations-title">Dos sucursales<br />en Mexicali</h2>
            <div className="landing-locations-contact">
              <a className="landing-wa" href={WHATSAPP} target="_blank" rel="noreferrer">Agendar por WhatsApp</a>
              <a className="landing-inline-link" href="tel:+526863086854">686 308 6854</a>
            </div>
          </header>
          <img className="landing-locations-photo" src="/landing/sucursales.jpg" alt="Sucursales Macristy y Zaragoza de Elixir Clinic" width="595" height="336" loading="lazy" />
          <div className="landing-location-details">
            {branches.map(branch => (
              <article key={branch.name}>
                <h3>{branch.name}</h3>
                <p>{branch.address}</p>
                <p>{branch.hours}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <footer className="landing-bottom">
        <div className="landing-shell">
          <span>Elixir Clinic · Mexicali</span>
          <Link href="/">Entrar al CRM</Link>
        </div>
      </footer>
    </div>
  </main>;
}
