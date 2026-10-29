import { notFound } from "next/navigation";

const sections = [
  "agenda",
  "pagos",
  "recordatorios",
  "pacientes",
  "consentimientos",
  "contratos",
  "equipo",
  "configuracion",
  "perfil",
  "login",
];

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

export default async function SectionPage({ params }) {
  const { section } = await params;

  if (!sections.includes(section)) {
    notFound();
  }

  return null;
}
