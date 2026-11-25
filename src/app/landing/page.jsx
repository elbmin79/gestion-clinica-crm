'use client';

import { useState } from 'react';
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
  { name: 'Sucursal Macristy', address: 'Calz. Macristy #916, Local 3, Mexicali', hours: 'Lunes a viernes de 11:00 a.m. a 7:00 p.m. Sábados de 9:00 a.m. a 2:00 p.m.' },
  { name: 'Sucursal Zaragoza', address: 'Av. Zaragoza #1769, Col. Nueva. Dentro de Centro Médico Vital', hours: 'Lunes a viernes de 10:00 a.m. a 6:00 p.m. Sábados de 9:00 a.m. a 2:00 p.m.' },
];

function LogoSwitch() {
  const [open, setOpen] = useState(false);
  return <div className="landing-switch">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <img src="/elixirclinic-logo-dark.png" alt="Elixir Clinic" width="1374" height="1145" />
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    <div className="landing-switch-menu" data-open={open} inert={!open} aria-hidden={!open}>
      <Link href="/" onClick={() => setOpen(false)}>CRM</Link>
      <a href="#inicio" onClick={() => setOpen(false)}>Landing</a>
    </div>
  </div>;
}

export default function LandingPage() {
  return <main className="clinic-landing" id="inicio">
    <header className="landing-top">
      <LogoSwitch />
      <nav>
        <a href="#servicios">Servicios</a>
        <a href="#sucursales">Sucursales</a>
        <a className="landing-header-book" href={WHATSAPP} target="_blank" rel="noreferrer">Agendar cita <ArrowUpRight size={15} aria-hidden="true" /></a>
      </nav>
    </header>
    <section className="landing-hero">
      <video autoPlay muted loop playsInline poster="/landing/still-1.jpg">
        <source src="/landing/hero.mp4" type="video/mp4" />
      </video>
      <div className="landing-hero-shade" />
      <div className="landing-hero-copy">
        <h1>Medicina estética <span>en Mexicali</span></h1>
        <p>Elixir Clinic</p>
        <div className="landing-hero-actions">
          <a className="landing-wa" href={WHATSAPP} target="_blank" rel="noreferrer">Agendar cita <ArrowUpRight size={17} aria-hidden="true" /></a>
          <a className="landing-services" href="#servicios">Ver servicios <ArrowDown size={17} aria-hidden="true" /></a>
        </div>
      </div>
    </section>
    <div className="landing-below">
      <section className="landing-story landing-shell" aria-labelledby="landing-story-title">
        <div className="landing-story-copy">
          <h2 id="landing-story-title">Valoración, tratamiento <em>y seguimiento</em></h2>
          <p>Faciales, corporales, láser e inyectables en un mismo expediente de cuidado.</p>
          <a className="landing-inline-link" href="#servicios">Explorar tratamientos <ArrowDown size={16} aria-hidden="true" /></a>
        </div>
        <video autoPlay muted loop playsInline poster="/landing/still-3.jpg" aria-label="Video de Elixir Clinic">
          <source src="/landing/clip-1.mp4" type="video/mp4" />
        </video>
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
          <img className="landing-services-photo" src="/landing/still-2.jpg" alt="" loading="lazy" />
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
