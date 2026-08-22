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


//controldor para editar la informacion del perfil (nombre, apellido, correo, contraseña) del usuario
export const editProfile = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    // Obtenemos el ID del usuario desde el token JWT.
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        message: "No autenticado",
      });
    }

    // Recibimos únicamente los datos editables del perfil.
    const { first_name, last_name, email } = req.body ?? {};

    // Verificamos que se haya enviado al menos un campo.
    if (
      first_name === undefined &&
      last_name === undefined &&
      email === undefined
    ) {
      return res.status(400).json({
        message: "No hay datos para actualizar",
      });
    }

    // Campos que se modificarán en la base de datos.
    const edits: Partial<typeof users.$inferInsert> = {};

    // Actualizar nombre si fue enviado.
    if (first_name !== undefined) {
      if (String(first_name).trim().length < 2) {
        return res.status(400).json({
          message: "El nombre debe tener al menos 2 caracteres",
        });
      }

      edits.first_name = String(first_name).trim();
    }

    // Actualizar apellido si fue enviado.
    if (last_name !== undefined) {
      if (String(last_name).trim().length < 2) {
        return res.status(400).json({
          message: "El apellido debe tener al menos 2 caracteres",
        });
      }

      edits.last_name = String(last_name).trim();
    }

    // Actualizar correo si fue enviado.
    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(String(email));

      // Comprobar que el correo no pertenezca a otro usuario.
      const [existingUser] = await db
        .select({
          user_id: users.user_id,
        })
        .from(users)
        .where(
          sql`LOWER(${users.email}) = LOWER(${normalizedEmail})
              AND ${users.user_id} <> ${userId}`
        )
        .limit(1);

      if (existingUser) {
        return res.status(409).json({
          message: "Este correo ya está registrado",
        });
      }

      edits.email = normalizedEmail;
    }

    // Guardamos los cambios del perfil.
    const [updatedUser] = await db
      .update(users)
      .set(edits)
      .where(eq(users.user_id, userId))
      .returning({
        userId: users.user_id,
        firstName: users.first_name,
        lastName: users.last_name,
        email: users.email,
        roleId: users.role_id,
      });

    if (!updatedUser) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    return res.status(200).json({
      message: "Perfil actualizado correctamente",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      message: "No se pudo actualizar el perfil",
    });
  }
};

//Controlador para obtener la informacion del perfil de usuario

