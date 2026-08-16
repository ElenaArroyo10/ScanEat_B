import { Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/connection";
import { emailVerifications, roleCodes, users } from "../db/schemas/userSchema";

import { generateToken } from "../utils/jwt";
import { hashPassword } from "../utils/passwords";
import { generateVerificationCode } from "../utils/generateCode";
import { sendVerificationEmail } from '../services/email.service';

const normalizeEmail = (value: string) => value.trim().toLowerCase();

// Función para verificar si las variables de entorno SMTP están configuradas correctamente
const isSmtpConfigured = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  const hasPlaceholders = [host, user, password].some((value) =>
    String(value ?? "").includes("YOUR_")
  );

  return Boolean(host && user && password && !hasPlaceholders);
};

// Función para crear o actualizar un registro de verificación de correo electrónico
const createOrUpdateVerification = async (userId: number, email: string) => {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const [existingVerification] = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.user_id, userId))
    .limit(1);

  if (existingVerification) {
    await db
      .update(emailVerifications)
      .set({
        code,
        expires_at: expiresAt,
        verified_at: null,
      })
      .where(eq(emailVerifications.user_id, userId));
  } else {
    await db.insert(emailVerifications).values({
      user_id: userId,
      code,
      expires_at: expiresAt,
      verified_at: null,
    });
  }

  if (isSmtpConfigured()) {
    try {
      await sendVerificationEmail({
        to: normalizeEmail(email),
        code,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email error";
      throw new Error(`No se pudo enviar el código al correo: ${message}`);
    }
  }

  return code;
};

// Controlador para el registro de usuarios
export const register = async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, email, password, code, role_id, firstName, lastName, roleId, roleCode } = req.body ?? {};

    const normalizedFirstName = first_name ?? firstName;
    const normalizedLastName = last_name ?? lastName;
    const normalizedEmail = email ? normalizeEmail(email) : "";
    const normalizedRoleId = Number(role_id ?? roleId);
    const normalizedCode = String(code ?? roleCode ?? "").trim().toUpperCase();

    if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !password || !normalizedCode || !Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) {
      return res.status(400).json({ message: "Faltan campos requeridos" });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 8 caracteres",
      });
    }

    const validRoleCode = await db
      .select()
      .from(roleCodes)
      .where(
        and(
          eq(roleCodes.code, normalizedCode),
          eq(roleCodes.role_id, normalizedRoleId),
          eq(roleCodes.is_active, true)
        )
      )
      .limit(1);

    if (!validRoleCode.length) {
      return res.status(400).json({
        message: "Código invalido",
      });
    }

    const [existingUser] = await db
      .select({
        user_id: users.user_id,
        email: users.email,
        email_verified: sql<boolean>`CASE WHEN ${emailVerifications.verified_at} IS NOT NULL THEN true ELSE false END`,
      })
      .from(users)
      .leftJoin(emailVerifications, eq(users.user_id, emailVerifications.user_id))
      .where(sql`LOWER(${users.email}) = LOWER(${normalizedEmail})`)
      .limit(1);

    if (existingUser) {
      if (existingUser.email_verified) {
        return res.status(409).json({
          message: "Este correo ya está registrado y verificado",
        });
      }

      let verificationCode: string;

      try {
        verificationCode = await createOrUpdateVerification(existingUser.user_id, existingUser.email);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown verification error";
        return res.status(500).json({ message });
      }

      const response = {
        message: "Este correo ya existe pero no está verificado. Se envió un nuevo código.",
      };

      if (process.env.APP_STAGE === "dev" && !isSmtpConfigured()) {
        Object.assign(response, {
          message: "Este correo ya existe pero no está verificado.",
          verificationCode,
        });
      }

      return res.status(200).json(response);
    }

    const hashedPassword = await hashPassword(String(password));

    const [user] = await db
      .insert(users)
      .values({
        first_name: String(normalizedFirstName),
        last_name: String(normalizedLastName),
        email: normalizedEmail,
        password: hashedPassword,
        role_id: validRoleCode[0].role_id,
      })
      .returning({
        user_id: users.user_id,
        email: users.email,
        role_id: users.role_id,
      });

    let verificationCode: string;

    try {
      verificationCode = await createOrUpdateVerification(user.user_id, user.email);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown verification error";
      return res.status(500).json({ message });
    }

    const token = await generateToken({
      user_id: user.user_id,
      email: user.email,
      role_id: user.role_id,
    });

    const response = {
      message: "Usuario registrado correctamente. Revisa tu correo para verificar la cuenta.",
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        roleId: user.role_id,
      },
    };

    if (process.env.APP_STAGE === "dev" && !isSmtpConfigured()) {
      Object.assign(response, {
        message: "Usuario registrado correctamente.",
        verificationCode,
      });
    }

    return res.status(201).json(response);
  } catch (error) {
    console.error("Error during registration:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Controlador para verificar el correo electrónico del usuario
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body ?? {};

    if (!email || !code) {
      return res.status(400).json({
        message: "El correo y el código de verificación son requeridos",
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

    const [verification] = await db
      .select()
      .from(emailVerifications)
      .where(eq(emailVerifications.user_id, user.user_id))
      .limit(1);

    if (!verification) {
      return res.status(404).json({ message: "No existe una verificación para este usuario" });
    }

    if (verification.verified_at) {
      return res.status(400).json({ message: "Este correo ya fue verificado" });
    }

    if (new Date(verification.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: "El código de verificación expiró" });
    }

    if (verification.code !== String(code).trim()) {
      return res.status(400).json({ message: "Código inválido" });
    }

    await db
      .update(emailVerifications)
      .set({ verified_at: new Date() })
      .where(eq(emailVerifications.verification_id, verification.verification_id));

    return res.status(200).json({
      message: "Correo verificado correctamente",
    });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({ message: "No se pudo verificar el correo" });
  }
};

// Controlador para reenviar el código de verificación al correo del usuario
export const resendVerificationCode = async (req: Request, res: Response) => {
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

    const [verification] = await db
      .select()
      .from(emailVerifications)
      .where(eq(emailVerifications.user_id, user.user_id))
      .limit(1);

    if (verification?.verified_at) {
      return res.status(400).json({ message: "Este correo ya está verificado" });
    }

    let verificationCode: string;

    try {
      verificationCode = await createOrUpdateVerification(user.user_id, user.email);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown verification error";
      return res.status(500).json({ message });
    }

    const response = {
      message: "Se envió un nuevo código de verificación",
    };

    if (process.env.APP_STAGE === "dev" && !isSmtpConfigured()) {
      Object.assign(response, {
        message: "SMTP no está configurado; usa el código dev para verificar tu cuenta.",
        verificationCode,
      });
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({ message: "No se pudo reenviar el código de verificación" });
  }
};

// Controlador para el inicio de sesión de usuarios(aqui iria)