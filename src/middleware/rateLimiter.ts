import rateLimit,{ipKeyGenerator} from "express-rate-limit";
import type { Request } from "express";


const emailKeyGenerator = (req: Request) => {
  const email = (req.body?.email ?? "").toString().toLowerCase().trim();
  return `${ipKeyGenerator(req.ip ?? "")}-${email}`;
};

//Limite de intentos para codigos
export const makeStrictLimiter=()=>rateLimit({
    windowMs:10*60*1000,
    max:8,
    skipSuccessfulRequests:true,
    keyGenerator:emailKeyGenerator,
    message:{
    message:"Demasiados intentos.Intentalo más tarde",
},
standardHeaders:true,
legacyHeaders:false,
});

//limite de  intentos para registros
export const makeModerateLimiter=()=>rateLimit({
    windowMs:15*60*1000,
    max:10,
    keyGenerator:emailKeyGenerator,
    message:{
    message:"Demasiados intentos.Intentalo más tarde",
},
standardHeaders:true,
legacyHeaders:false,
});

//instancias para conteos de limites unicos


export const loginLimiter = makeStrictLimiter();
export const verifyLoginLimiter = makeStrictLimiter();
export const verifyEmailLimiter = makeStrictLimiter();
export const resetPasswordLimiter = makeStrictLimiter();

export const registerLimiter = makeModerateLimiter();
export const resendVerificationLimiter = makeModerateLimiter();
export const resendLoginLimiter = makeModerateLimiter();
export const forgotPasswordLimiter = makeModerateLimiter();
export const resendResetLimiter = makeModerateLimiter();

