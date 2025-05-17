import Joi from "joi";

/* CHOIR */

export const createGroupSchema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string().optional()    
})