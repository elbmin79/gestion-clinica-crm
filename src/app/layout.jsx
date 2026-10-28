import "./fonts.css";
import "./globals.css";
import "./font-tokens.css";
import App from "./app-shell";

export const metadata = {
  title: "CRM clínico",
  description:
    "Espacio de trabajo clínico para pacientes, documentos y agenda.",
};

// Authenticated requests must not reuse HTML or refreshed session cookies across users.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body><App>{children}</App></body>
    </html>
  );
}
