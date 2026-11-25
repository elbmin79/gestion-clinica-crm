'use client';

import { useState } from 'react';
import Link from 'next/link';
import './landing.css';

const WHATSAPP = 'https://wa.me/5216863086854?text=' + encodeURIComponent('Hola, quiero agendar una cita en Elixir Clinic.');

const money = (amount, currency = 'MXN') => new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

const services = [
  { category: 'Faciales', image: '/landing/still-3.jpg', items: [
    ['Facial Limpieza', '30 min', `${money(700)} · paquete ${money(2500)}`],
    ['Dermapen ácido hialurónico', '30 min', `${money(1000)} · paquete ${money(2500)}`],
    ['Dermapen PDRN de Salmón', '30 min', `${money(1000)} · paquete ${money(3500)}`],
    ['Dermapen Pink K Coreano', '30 min', `${money(799)} · paquete ${money(3500)}`],
    ['Mesoject Gun', '30 min', `${money(3500)} · 5 sesiones ${money(5000)}`],
    ['Oxygen Bubbles', '30 min', `${money(999)} · 5 sesiones ${money(4000)}`],
    ['Radiofrecuencia Fraccionada', '30 min', `${money(100, 'USD')} · 3 sesiones ${money(250, 'USD')}`],
    ['Morpheus 8', '30 min', `${money(300, 'USD')} · 3 sesiones ${money(500, 'USD')}`],
    ['HIFU 7D Ultraformer – Full Face', '', money(130, 'USD')],
    ['Hydrafacial GlowUp', '', money(1200)],
    ['Dermalift Profiler', '', money(1500)],
  ]},
  { category: 'Corporales', image: '/landing/still-2.jpg', items: [
    ['Drenaje linfático', '25–30 min', `Paquete ${money(2500)}`],
    ['Masaje relajante / descontracturante', '60 min', `${money(800)} · paquete ${money(2500)}`],
    ['Emszero', '30 min', `${money(500)} · paquete ${money(2500)}`],
    ['Emszero – Peptonas', '30 min', `Paquete ${money(3500)}`],
    ['Dermalift', '30 min', `Paquete ${money(4000)}`],
    ['Exilis Luxury 360', '', money(2000)],
  ]},
  { category: 'Depilación láser', image: '/landing/still-2.jpg', items: [
    ['Por zona', '15–60 min', 'Paquetes de 10 sesiones'],
    ['Piernas completas', '', money(4000)],
    ['Rostro completo', '', money(3000)],
    ['Axilas, bikini o patillas', '', money(1500)],
    ['Bigote, mentón o nariz', '', money(999)],
  ]},
  { category: 'Inyectables', image: '/landing/still-1.jpg', items: [
    ['Toxina botulínica · Frente', '20 unidades', money(2000)],
    ['Toxina botulínica · Entrecejo', '12 unidades', money(1200)],
    ['Toxina botulínica · Patitas de gallo', '18 unidades', money(1800)],
    ['Toxina botulínica · Antifaz completo', '50 unidades', money(4000)],
    ['Relleno de ácido hialurónico', '', money(4000)],
    ['Sculptra', '', `${money(450, 'USD')} · 3 sesiones ${money(1200, 'USD')}`],
    ['ADN de salmón', '', money(1500)],
    ['NCTF o NCPR', '', money(1800)],
  ]},
  { category: 'Sueroterapia y lipoláser', image: '/landing/still-2.jpg', items: [
    ['EL BOOST', '', money(1500)],
    ['Valoración lipoláser', '', money(500)],
    ['Lipoláser · 1 área', '', money(550, 'USD')],
    ['Lipoláser · 3 áreas', '', money(1100, 'USD')],
  ]},
  { category: 'Consultas', image: '/landing/still-3.jpg', items: [
    ['Valoración', '', 'Agenda tu primera visita'],
    ['Revisión de bótox, relleno o enolyse', '15 min', 'Seguimiento de tu tratamiento'],
    ['Alopecia / caída de cabello', '30 min', money(2000)],
  ]},
];

const branches = [
  { name: 'Sucursal Macristy', address: 'Calz. Macristy #916, Local 3, Mexicali', hours: 'Lunes a viernes de 11:00 a.m. a 7:00 p.m. Sábados de 9:00 a.m. a 2:00 p.m.' },
  { name: 'Sucursal Zaragoza', address: 'Av. Zaragoza #1769, Col. Nueva. Dentro de Centro Médico Vital', hours: 'Lunes a viernes de 10:00 a.m. a 6:00 p.m. Sábados de 9:00 a.m. a 2:00 p.m.' },
];

function LogoSwitch() {
  const [open, setOpen] = useState(false);
  return <div className="landing-switch">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <img src="/elixirclinic-logo.png" alt="Elixir Clinic" />
    </button>
    {open && <div className="landing-switch-menu">
      <Link href="/" onClick={() => setOpen(false)}>CRM</Link>
      <a href="#inicio" onClick={() => setOpen(false)}>Landing</a>
    </div>}
  </div>;
}

export default function LandingPage() {
  return <main className="clinic-landing" id="inicio">
    <header className="landing-top">
      <LogoSwitch />
      <nav>
        <a href="#servicios">Servicios</a>
        <a href="#sucursales">Sucursales</a>
        <a className="landing-wa" href={WHATSAPP} target="_blank" rel="noreferrer">Agendar cita</a>
      </nav>
    </header>
    <section className="landing-hero">
      <video autoPlay muted loop playsInline poster="/landing/still-1.jpg">
        <source src="/landing/hero.mp4" type="video/mp4" />
      </video>
      <div className="landing-hero-shade" />
      <div className="landing-hero-copy">
        <img src="/elixirclinic-logo.png" alt="" />
        <p>Skin · Laser · Vitality</p>
        <h1>Medicina estética en Mexicali</h1>
        <div className="landing-hero-actions">
          <a className="landing-services" href="#servicios">Ver servicios</a>
          <a className="landing-wa" href={WHATSAPP} target="_blank" rel="noreferrer">Agendar cita</a>
        </div>
      </div>
    </section>
    <section className="landing-intro">
      <video autoPlay muted loop playsInline poster="/landing/still-3.jpg"><source src="/landing/clip-1.mp4" type="video/mp4" /></video>
      <div>
        <p className="landing-kicker">Elixir Clinic</p>
        <h2>Faciales, corporales, láser e inyectables en un mismo expediente de cuidado.</h2>
        <p>Valoración, tratamiento y seguimiento. Dos sucursales en Mexicali y un mismo número para agendar.</p>
      </div>
    </section>
    <section id="servicios" className="landing-services-wrap">
      <div className="landing-section-head">
        <p className="landing-kicker">Servicios</p>
        <h2>Lo que puedes agendar</h2>
      </div>
      {services.map(group => <article key={group.category} className="landing-group">
        <img src={group.image} alt="" />
        <div>
          <h3>{group.category}</h3>
          <ul>{group.items.map(([name, detail, price]) => <li key={name}><span><strong>{name}</strong>{detail && <small>{detail}</small>}</span><b>{price}</b></li>)}</ul>
        </div>
      </article>)}
    </section>
    <section id="sucursales" className="landing-branches">
      <img src="/landing/sucursales.jpg" alt="Sucursales Macristy y Zaragoza de Elixir Clinic" />
      <div>
        <p className="landing-kicker">Sucursales</p>
        <h2>Mexicali</h2>
        {branches.map(branch => <article key={branch.name}><h3>{branch.name}</h3><p>{branch.address}</p><p>{branch.hours}</p></article>)}
        <p className="landing-phone">686 308 6854</p>
        <a className="landing-wa" href={WHATSAPP} target="_blank" rel="noreferrer">Agendar por WhatsApp</a>
      </div>
    </section>
    <footer className="landing-foot">
      <span>Elixir Clinic · Mexicali</span>
      <Link href="/">Entrar al CRM</Link>
    </footer>
  </main>;
}
