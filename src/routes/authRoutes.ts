import { Router } from "express";

  import { forgotPassword } from "../controllers/verificationController";
  import { register } from "../controllers/registerController";
  import { resendVerificationCode } from "../controllers/verificationController";
  import { resetPassword } from "../controllers/verificationController";
  import { verifyEmail } from "../controllers/registerController";
  import { login } from "../controllers/loginController";
  import { verifyLoginCode } from "../controllers/loginController";
  import { resendLoginCode } from "../controllers/loginController";
  import { resendResetCode } from "../controllers/verificationController";
  import { editProfile } from "../controllers/profileController";
  


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

export default router;