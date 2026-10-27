import "./globals.css";
import App from "./app-shell";
import { Nunito } from "next/font/google";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "CRM clínico",
  description:
    "Espacio de trabajo clínico para pacientes, documentos y agenda.",
};

// Authenticated requests must not reuse HTML or refreshed session cookies across users.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={nunito.variable}>
      <body><App>{children}</App></body>
    </html>
  );
}
