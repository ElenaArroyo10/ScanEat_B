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
        const normalizedCode = String(code).trim();

        // Buscar registro pendiente
        const [pendingRegistration] = await db
            .select()
            .from(pendingRegistrations)
            .where(
                sql`LOWER(${pendingRegistrations.email}) = LOWER(${normalizedEmail})`
            )
            .limit(1);

        if (!pendingRegistration) {
            return res.status(404).json({
                message:
                    "No existe un registro pendiente para este correo",
            });
        }

        // Verificar expiración
        if (
            new Date(pendingRegistration.expires_at).getTime() <
            Date.now()
        ) {
            return res.status(400).json({
                message: "El código de verificación expiró",
            });
        }

        // Verificar código
        if (pendingRegistration.code !== normalizedCode) {
            return res.status(400).json({
                message: "Código inválido",
            });
        }

        // Crear usuario REAL
        const [user] = await db
            .insert(users)
            .values({
                first_name: pendingRegistration.first_name,
                last_name: pendingRegistration.last_name,
                email: pendingRegistration.email,
                password: pendingRegistration.password,
                role_id: pendingRegistration.role_id,
            })
            .returning({
                user_id: users.user_id,
                email: users.email,
                role_id: users.role_id,
            });

        // Crear registro de verificación ya verificado
        await db.insert(emailVerifications).values({
            user_id: user.user_id,
            code: pendingRegistration.code,
            expires_at: new Date(),
            verified_at: new Date(),
        });

        // Eliminar registro temporal
        await db
            .delete(pendingRegistrations)
            .where(
                eq(
                    pendingRegistrations.pending_id,
                    pendingRegistration.pending_id
                )
            );

        return res.status(201).json({
            message:
                "Correo verificado correctamente. Tu cuenta ha sido creada.",
            user: {
                userId: user.user_id,
                email: user.email,
                roleId: user.role_id,
            },
        });
    } catch (error) {
        console.error("Verify email error:", error);

        return res.status(500).json({
            message: "No se pudo verificar el correo",
        });
    }
};



// Controlador para el registro de usuarios
export const register = async (req: Request, res: Response) => {
    try {
        const {
            first_name,
            last_name,
            email,
            password,
            code,
            role_id,
            firstName,
            lastName,
            roleId,
            roleCode,
        } = req.body ?? {};

        const normalizedFirstName = first_name ?? firstName;
        const normalizedLastName = last_name ?? lastName;
        const normalizedEmail = email ? normalizeEmail(email) : "";
        const normalizedRoleId = Number(role_id ?? roleId);
        const normalizedCode = String(code ?? roleCode ?? "")
            .trim()
            .toUpperCase();

        if (
            !normalizedFirstName ||
            !normalizedLastName ||
            !normalizedEmail ||
            !password ||
            !normalizedCode ||
            !Number.isInteger(normalizedRoleId) ||
            normalizedRoleId <= 0
        ) {
            return res.status(400).json({
                message: "Faltan campos requeridos",
            });
        }

        if (String(password).length < 8) {
            return res.status(400).json({
                message: "La contraseña debe tener al menos 8 caracteres",
            });
        }

        // Validar código de autorización del empleado
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
                message: "Código de autorización inválido",
            });
        }

        // Verificar si el usuario ya existe
        const [existingUser] = await db
            .select({
                user_id: users.user_id,
                email: users.email,
            })
            .from(users)
            .where(sql`LOWER(${users.email}) = LOWER(${normalizedEmail})`)
            .limit(1);

        if (existingUser) {
            return res.status(409).json({
                message: "Este correo ya está registrado",
            });
        }

        // Verificar si ya existe un registro pendiente
        const [existingPending] = await db
            .select()
            .from(pendingRegistrations)
            .where(
                sql`LOWER(${pendingRegistrations.email}) = LOWER(${normalizedEmail})`
            )
            .limit(1);

        // Hashear contraseña antes de almacenarla temporalmente
        const hashedPassword = await hashPassword(String(password));

        // Generar código de verificación
        const verificationCode = generateVerificationCode();

        // El código dura 10 minutos
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        if (existingPending) {
            // Actualizar registro pendiente existente
            await db
                .update(pendingRegistrations)
                .set({
                    first_name: String(normalizedFirstName),
                    last_name: String(normalizedLastName),
                    password: hashedPassword,
                    role_id: validRoleCode[0].role_id,
                    code: verificationCode,
                    expires_at: expiresAt,
                })
                .where(
                    eq(
                        pendingRegistrations.pending_id,
                        existingPending.pending_id
                    )
                );
        } else {
            // Crear registro temporal
            await db.insert(pendingRegistrations).values({
                first_name: String(normalizedFirstName),
                last_name: String(normalizedLastName),
                email: normalizedEmail,
                password: hashedPassword,
                role_id: validRoleCode[0].role_id,
                code: verificationCode,
                expires_at: expiresAt,
            });
        }

        // Enviar código al correo
        try {
            await sendVerificationEmail({
                to: normalizedEmail,
                code: verificationCode,
            });
        } catch (error) {
            console.error(
                "Error al enviar código de verificación:",
                error
            );

            return res.status(500).json({
                message:
                    "No se pudo enviar el código de verificación al correo",
            });
        }

        return res.status(200).json({
            message:
                "Te enviamos un código de verificación a tu correo.",
            email: normalizedEmail,
        });
    } catch (error) {
        console.error("Error during registration:", error);

        return res.status(500).json({
            message: "No se pudo iniciar el registro",
        });
    }
};