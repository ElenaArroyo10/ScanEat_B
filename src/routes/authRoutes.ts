import { Router } from "express";
import {
  forgotPassword,
  register,
  resendVerificationCode,
  resetPassword,
  verifyEmail,
  login,
  verifyLoginCode,
  resendLoginCode,
  resendResetCode,
  editProfile,
changePassword} from "../controllers/authController";
import { validateBody } from "../middleware/validations";
import { registerUserSchema } from "../db/schemas/userSchema";
import { authenticate } from "../middleware/authenticate";

const router = Router();

router.post("/register", validateBody(registerUserSchema), register);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification-code", resendVerificationCode);
router.post("/login", login);
router.post("/verify-login-code", verifyLoginCode);
router.post("/resend-login-code", resendLoginCode);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/resend-reset-code", resendResetCode);
router.patch("/edit-profile", authenticate, editProfile);
router.patch("/change-password", authenticate, changePassword);
export default router;