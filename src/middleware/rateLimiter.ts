import rateLimit from "express-rate-limit";


//Limite de intentos para codigos
export const strictLimiter=rateLimit({
    windowMs:10*60*1000,
    max:5,
    message:{
    message:"Demasiados intentos.Intentalo más tarde",
},
standardHeaders:true,
legacyHeaders:false,
});

//limite de  intentos para registros
export const moderateLimiter=rateLimit({
    windowMs:15*60*1000,
    max:10,
    message:{
    message:"Demasiados intentos.Intentalo más tarde",
},
standardHeaders:true,
legacyHeaders:false,
});