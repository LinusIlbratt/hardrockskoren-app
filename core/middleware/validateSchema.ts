import { sendError } from "../utils/http"

export function validateSchema(schema) {
    return {
      before: async (request) => {
        try {
          await schema.validateAsync(JSON.parse(request.event.body));
        } catch (error) {
          return sendError(400, error.details.at(0).message);
        }
      },
    };
  }
