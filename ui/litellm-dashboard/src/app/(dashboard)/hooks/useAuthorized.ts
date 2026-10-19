"use client";

import { isSemantierGateway } from "@/lib/http/semantier";
import { useSemantierSession } from "@/components/semantier/SemantierSession";

import { clearTokenCookies, getCookie } from "@/utils/cookieUtils";
import { checkTokenValidity, decodeToken } from "@/utils/jwtUtils";
import { useEffect, useMemo } from "react";
import { effectiveSessionRole, formatUserRole, isViewOnlySessionRole } from "@/utils/roles";
import { useCurrentUser } from "./currentUser/useCurrentUser";
import { redirectToLogin } from "./redirectToLogin";
import { useUIConfig } from "./uiConfig/useUIConfig";

const useNativeAuthorized = () => {
  const { data: uiConfig, isLoading: isUIConfigLoading } = useUIConfig();

  const token = typeof document !== "undefined" ? getCookie("token") : null;

  const decoded = useMemo(() => decodeToken(token), [token]);
  const isTokenValid = useMemo(() => checkTokenValidity(token), [token]);
  const {
    data: currentUser,
    isLoading: isCurrentUserLoading,
    isError: isCurrentUserError,
  } = useCurrentUser(isTokenValid ? decoded?.key ?? null : null, decoded?.auth_header_name, !isUIConfigLoading);
  const serverRole = currentUser?.user_role ?? "";
  const isLoading = isUIConfigLoading || isCurrentUserLoading;
  const isAuthorized = isTokenValid && !uiConfig?.admin_ui_disabled && !isCurrentUserError;

  // Single useEffect for all redirect logic
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthorized) {
      if (token) {
        clearTokenCookies();
      }
      redirectToLogin();
    }
  }, [isLoading, isAuthorized, token]);

  return {
    isLoading,
    isAuthorized,
    token: isAuthorized ? token : null,
    accessToken: decoded?.key ?? null,
    userId: currentUser?.user_id ?? null,
    userEmail: currentUser?.user_email ?? null,
    organizationId: null as string | null,
    providerCredentialPrefix: null as string | null,
    userRole: effectiveSessionRole(serverRole),
    userRoleLabel: formatUserRole(serverRole),
    isViewOnly: isViewOnlySessionRole(serverRole),
    premiumUser: decoded?.premium_user ?? null,
    disabledPersonalKeyCreation: decoded?.disabled_non_admin_personal_key_creation ?? null,
    loginMethod: decoded?.login_method ?? null,
    showSSOBanner: decoded?.login_method === "username_password",
    passwordResetRequired: decoded?.password_reset_required === true,
  };
};

function useSemantierAuthorized() {
  const session = useSemantierSession();
  return {
    isLoading: false,
    isAuthorized: true,
    token: null,
    accessToken: null,
    userId: session.user_id,
    organizationId: session.organization_id,
    providerCredentialPrefix: session.provider_credential_prefix ?? null,
    userEmail: null,
    userRole: session.permissions.includes("provider_credentials:manage") ? "Admin" : "Admin Viewer",
    userRoleLabel: "Semantier operator",
    isViewOnly: !session.permissions.includes("provider_credentials:manage"),
    premiumUser: false,
    disabledPersonalKeyCreation: true,
    loginMethod: "semantier_cookie",
    showSSOBanner: false,
    passwordResetRequired: false,
  };
}

const useAuthorized = isSemantierGateway ? useSemantierAuthorized : useNativeAuthorized;
export default useAuthorized;
