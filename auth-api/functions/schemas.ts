import Joi from "joi";

export const changePasswordSchema = Joi.object({
    oldPassword: Joi.string().min(8).required(),
    newPassword: Joi.string().min(8).required(),
    confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required().messages({
      "any.only": "Passwords do not match",
      "any.required": "Please confirm your new password",
    }),
  });

  export const adminChangePasswordSchema = Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Email must be a valid email address",
      "any.required": "Email is required",
    }),
  
    newPassword: Joi.string().min(8).required().messages({
      "string.min": "Password must be at least 8 characters long",
      "any.required": "New password is required",
    }),
  });
  