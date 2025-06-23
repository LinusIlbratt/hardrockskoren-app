import Joi from "joi";

/* CHOIR */

export const createGroupSchema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string().optional(),
    groupSlug: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/) 
    .max(128)
    .required()
})