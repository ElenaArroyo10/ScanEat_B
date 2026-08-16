import { Router } from "express";
import {
  register,
  resendVerificationCode,
  verifyEmail,
} from "../controllers/authController";
import { validateBody } from "../middleware/validations";
import { registerUserSchema } from "../db/schemas/userSchema";

const router = Router();

router.post("/register", validateBody(registerUserSchema), register);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification-code", resendVerificationCode);


export default router;