import Joi from "joi";

/* CHOIR */

export const createGroupSchema = Joi.object({
    name: Joi.string().required(),
    choirLeader: Joi.string().optional().allow(''),
    groupSlug: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/) 
    .max(128)
    .required()
})