import { Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/connection";
import { emailVerifications, loginVerifications,resetVerifications,  pendingRegistrations, roleCodes, users } from "../db/schemas/userSchema";
import { desc } from "drizzle-orm";
import { generateToken } from "../utils/jwt";
import { hashPassword } from "../utils/passwords";
import { comparePassword } from "../utils/passwords";
import { generateVerificationCode } from "../utils/generateCode";
import { sendVerificationEmail } from '../services/email.service';
import { AuthRequest } from "../middleware/authenticate";
import { normalizeEmail } from "./auth.Util";
import { isSmtpConfigured } from "./auth.Util";





// Controlador para el inicio de sesión de usuarios
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

if (!email || !password) {
    return res.status(400).json({
      message: "El correo y la contraseña son requeridos" 
    });
}

const normalizedEmail = normalizeEmail(email);

const [user] = await db.select({
  user_id: users.user_id,
  email: users.email,
  password: users.password,
})
.from(users)
.where(sql`LOWER(${users.email}) = LOWER(${normalizedEmail})`)
.limit(1);

if (!user) {
    return res.status(401).json({ message: "Credenciales invalidas" });
}
const isPasswordValid = await comparePassword(String(password), String(user.password)
);

if (!isPasswordValid) {
    return res.status(401).json({ message: "Credenciales invalidas" });
}

const emailVerification = await db.select().from(emailVerifications).where(eq(emailVerifications.user_id, user.user_id)).limit(1);

if (!emailVerification.length || !emailVerification[0].verified_at) {
    return res.status(403).json({ message: "El correo no está verificado" });
}
const code = generateVerificationCode();
const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

await db.insert(loginVerifications).values({
  user_id: user.user_id,
  code,
  expires_at: expiresAt,
});

try{
  await sendVerificationEmail({
    to:user.email,
    code,
  });
}catch(error){
  console.error("Error al enviar la verificación del correo:", error);
  return res.status(500).json({ message: "No se pudo enviar el código de verificación al correo" });
}
return res.status(200).json({
  message: "Revisa tu correo para completar el inicio de sesión",
  requiresTwoFactor: true,
});
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "No se pudo iniciar sesión" });
  }
};

export const verifyLoginCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body ?? {};
    if (!email || !code) {
      return res.status(400).json({ 
        message: "El correo y el código son requeridos" 
      });
    }

    const normalizedEmail = normalizeEmail(email);

    const [user] = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = LOWER(${normalizedEmail})`)
    .limit(1);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const [logingCode] = await db
    .select()
    .from(loginVerifications)
    .where(eq(loginVerifications.user_id, user.user_id))
    .orderBy(desc(loginVerifications.otp_id))
    .limit(1);

    if (!logingCode) {
      return res.status(404).json({ message: "No existe un código de verificación para este usuario" });
    }

    if (new Date(logingCode.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: "El código de verificación expiró" });
    }

    if (logingCode.code !== String(code).trim()) {
      return res.status(400).json({ message: "Código inválido" });
    }

    const token = await generateToken({
      user_id: user.user_id,
      email: user.email,
      role_id: user.role_id,
    });

    await db
    .delete(loginVerifications)
    .where(eq(loginVerifications.user_id, user.user_id));

    return res.status(200).json({
      message: "Inicio de sesión exitoso",
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        roleId: user.role_id,
      },
    });
  } catch (error) {
    console.error("Verify login code error:", error);
    return res.status(500).json({ message: "No se pudo verificar el código de inicio de sesión" });
  } 
};

//controlador para reenviar el login code al correo
export const resendLoginCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body ?? {};

    if (!email) {
      return res.status(400).json({
        message: "El correo es requerido",
      });
    }

    const normalizedEmail = normalizeEmail(email);

    // Generar un nuevo código
    const verificationCode = generateVerificationCode();

    // El nuevo código tendrá una duración de 10 minutos
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Actualizar el código y la fecha de expiración
    await db
      .update(loginVerifications)
      .set({
        code: verificationCode,
        expires_at: expiresAt,
      })
      .where(
        eq(
          loginVerifications.user_id,
          sql`(SELECT user_id FROM users WHERE LOWER(email) = LOWER(${normalizedEmail}))`
        )
      );

    // Enviar el nuevo código al correo
    try {
      await sendVerificationEmail({
      to: normalizeEmail(normalizedEmail),
      code: verificationCode,
      });
    } catch (error) {
      console.error(
        "Error al enviar el código de verificación:",
        error
      );

      return res.status(500).json({
        message:
          "No se pudo enviar el código de verificación al correo",
      });
    }

    const response: {
      message: string;
      verificationCode?: string;
    } = {
      message: "Se envió un nuevo código de verificación",
    };

    // Código de desarrollo si SMTP no está configurado
    if (process.env.APP_STAGE === "dev" && !isSmtpConfigured()) {
      response.message =
        "SMTP no está configurado; usa el código dev para verificar tu cuenta.";

      response.verificationCode = verificationCode;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Resend verification error:", error);

    return res.status(500).json({
      message: "No se pudo reenviar el código de verificación",
    });
  }
};
