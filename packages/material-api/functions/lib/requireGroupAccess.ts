/**
 * Re-export from @hrk/core so existing material-api imports keep working.
 * Prefer importing from packages/core/utils/requireGroupAccess going forward.
 */
export {
  requireGroupAccessResponse,
  normalizeGroupSlug,
  type LambdaAuthorizerContext,
} from "../../../core/utils/requireGroupAccess";
