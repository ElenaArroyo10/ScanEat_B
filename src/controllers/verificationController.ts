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



// Controlador para reenviar el código de verificación al correo
export const resendVerificationCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body ?? {};

    if (!email) {
      return res.status(400).json({
        message: "El correo es requerido",
      });
    }

    const normalizedEmail = normalizeEmail(email);

    // Buscar el registro pendiente
    const [pendingRegistration] = await db
      .select()
      .from(pendingRegistrations)
      .where(
        sql`LOWER(${pendingRegistrations.email}) = LOWER(${normalizedEmail})`
      )
      .limit(1);

    if (!pendingRegistration) {
      return res.status(404).json({
        message: "No existe un registro pendiente para este correo",
      });
    }

    // Generar un nuevo código
    const verificationCode = generateVerificationCode();

    // El nuevo código tendrá una duración de 10 minutos
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Actualizar el código y la fecha de expiración
    await db
      .update(pendingRegistrations)
      .set({
        code: verificationCode,
        expires_at: expiresAt,
      })
      .where(
        eq(
          pendingRegistrations.pending_id,
          pendingRegistration.pending_id
        )
      );

    // Enviar el nuevo código al correo
    try {
      await sendVerificationEmail({
        to: pendingRegistration.email,
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


//controlador para restablecer la contraseña del usuario
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body ?? {};
    if (!email) {
      return res.status(400).json({ message: "El correo es requerido" });
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

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db
      .delete(resetVerifications)
      .where(eq(resetVerifications.user_id, user.user_id));

    await db.insert(resetVerifications).values({
      user_id: user.user_id,
      code,
      expires_at: expiresAt,
    });

    try {
      await sendVerificationEmail({
        to: user.email,
        code,
      });
    } catch (error) {
      console.error("Error al enviar el código de restablecimiento de contraseña:", error);
      return res.status(500).json({ message: "No se pudo enviar el código de restablecimiento al correo" });
    }

    return res.status(200).json({ message: "Se ha enviado un código de restablecimiento a tu correo" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "No se pudo procesar la solicitud de restablecimiento de contraseña" });
  }
};

// Controlador para restablecer la contraseña del usuario
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body ?? {};

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        message: "El correo, el código y la nueva contraseña son requeridos",
      });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 8 caracteres",
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

    const [resetCode] = await db
      .select()
      .from(resetVerifications)
      .where(eq(resetVerifications.user_id, user.user_id))
      .orderBy(desc(resetVerifications.reset_id))
      .limit(1);

    if (!resetCode) {
      return res.status(404).json({
        message: "No existe un código de recuperación para este usuario",
      });
    }

    if (new Date(resetCode.expires_at).getTime() < Date.now()) {
      return res.status(400).json({
        message: "El código de recuperación expiró",
      });
    }

    if (resetCode.code !== String(code).trim()) {
      return res.status(400).json({
        message: "Código inválido",
      });
    }

    const hashedPassword = await hashPassword(String(newPassword));

    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.user_id, user.user_id));

    await db
      .delete(resetVerifications)
      .where(eq(resetVerifications.user_id, user.user_id));

    await db
      .delete(loginVerifications)
      .where(eq(loginVerifications.user_id, user.user_id));

    return res.status(200).json({
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({
      message: "No se pudo restablecer la contraseña",
    });
  }
};

//controlador para reenviar el reset code al correo
export const resendResetCode = async (req: Request, res: Response) => {
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
      .update(resetVerifications)
      .set({
        code: verificationCode,
        expires_at: expiresAt,
      })
      .where(
        eq(
          resetVerifications.user_id,
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
