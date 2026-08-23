
export const validatePasswordStrength = (password: string): string | null => {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!/\d/.test(password)) return "La contraseña debe contener al menos un número";
  if (!/[!@#$%^&*(),.?":{}|<>_\-\\[\]'/+=;`~]/.test(password)) {
    return "La contraseña debe contener al menos un símbolo";
  }
  return null;
};