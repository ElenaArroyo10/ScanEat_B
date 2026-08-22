


export const normalizeEmail = (value: string) => value.trim().toLowerCase();

// Función para verificar si las variables de entorno SMTP están configuradas correctamente
export const isSmtpConfigured = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  const hasPlaceholders = [host, user, password].some((value) =>
    String(value ?? "").includes("YOUR_")
  );

  return Boolean(host && user && password && !hasPlaceholders);
};