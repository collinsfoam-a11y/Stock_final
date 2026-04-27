import {
  getAuthRouteNotice,
  getLoginErrorNotification,
  getOfflineAuthNotice,
  pickPreferredAuthNotice,
  getRegistrationErrorNotification,
  getRegistrationFieldErrors,
} from "../authErrorNotifications";

describe("authErrorNotifications", () => {
  it("maps invalid credential login errors to a plain-language sign-in message", () => {
    expect(
      getLoginErrorNotification(
        {
          success: false,
          code: "AUTH_INVALID_CREDENTIALS",
        },
        "credentials",
      ),
    ).toEqual({
      title: "Incorrect Sign-In Details",
      message: "The username or password is incorrect. Try again.",
      action: null,
      tone: "error",
    });
  });

  it("maps disabled accounts to a stable admin-facing warning", () => {
    expect(
      getLoginErrorNotification(
        {
          success: false,
          code: "ACCOUNT_DISABLED",
        },
        "credentials",
      ),
    ).toEqual({
      title: "Account Disabled",
      message:
        "This account is currently disabled. Contact your administrator for access.",
      action: null,
      tone: "warning",
    });
  });

  it("formats retry-after metadata into a user-readable wait message", () => {
    expect(
      getLoginErrorNotification(
        {
          success: false,
          code: "AUTH_RATE_LIMITED",
          retryAfter: 90,
        },
        "credentials",
      ),
    ).toEqual({
      title: "Too Many Attempts",
      message: "Wait about 2 minutes, then try again.",
      action: "wait",
      tone: "warning",
    });
  });

  it("maps restricted-network login errors to a clear network explanation", () => {
    expect(
      getLoginErrorNotification(
        {
          success: false,
          code: "NETWORK_NOT_ALLOWED",
        },
        "credentials",
      ),
    ).toEqual({
      title: "Restricted Network",
      message:
        "This app only works on the permitted local network. Connect to that network and try again.",
      action: "check_network",
      tone: "warning",
    });
  });

  it("turns duplicate-username registration failures into a simple actionable notice", () => {
    expect(
      getRegistrationErrorNotification({
        response: {
          status: 400,
          data: {
            code: "AUTH_USERNAME_EXISTS",
            message: "Username already exists",
          },
        },
      }),
    ).toEqual({
      title: "Username Taken",
      message:
        "That username is already in use. Choose a different username and try again.",
      action: "change_username",
      tone: "error",
    });
  });

  it("formats validation arrays into readable registration guidance", () => {
    expect(
      getRegistrationErrorNotification({
        response: {
          status: 422,
          data: {
            detail: [
              { loc: ["body", "full_name"], msg: "Field required" },
              {
                loc: ["body", "password"],
                msg: "Input should be at least 6 characters",
              },
            ],
          },
        },
      }),
    ).toEqual({
      title: "Check Your Details",
      message:
        "Full Name is required.\nPassword must be at least 6 characters.",
      action: "fix_form",
      tone: "warning",
    });
  });

  it("extracts field-level registration errors for inline form rendering", () => {
    expect(
      getRegistrationFieldErrors({
        response: {
          status: 422,
          data: {
            detail: [
              { loc: ["body", "full_name"], msg: "Field required" },
              {
                loc: ["body", "password"],
                msg: "Input should be at least 6 characters",
              },
            ],
          },
        },
      }),
    ).toEqual({
      full_name: "Full Name is required.",
      password: "Password must be at least 6 characters.",
    });
  });

  it("maps closed bootstrap registration to a sign-in oriented message", () => {
    expect(
      getRegistrationErrorNotification({
        response: {
          status: 403,
          data: {
            detail: {
              code: "ADMIN_REQUIRED",
              message: "Only administrators can register new users",
            },
          },
        },
      }),
    ).toEqual({
      title: "Registration Closed",
      message:
        "This workspace is already set up. Sign in and ask an administrator to create your account.",
      action: "sign_in",
      tone: "info",
    });
  });

  it("maps registration restricted-network failures to a clear recovery step", () => {
    expect(
      getRegistrationErrorNotification({
        response: {
          status: 403,
          data: {
            detail: {
              code: "NETWORK_NOT_ALLOWED",
              message: "Network not allowed",
            },
          },
        },
      }),
    ).toEqual({
      title: "Restricted Network",
      message:
        "This app only works on the permitted local network. Connect to that network and try again.",
      action: "check_network",
      tone: "warning",
    });
  });

  it("provides a route-level notice for closed registration redirects", () => {
    expect(getAuthRouteNotice("registration_closed")).toEqual({
      title: "Account Creation Closed",
      message:
        "This workspace is already set up. Sign in and ask an administrator to create your account.",
      action: null,
      tone: "info",
    });
  });

  it("prefers the higher-priority auth notice when multiple notices compete", () => {
    expect(
      pickPreferredAuthNotice(
        getAuthRouteNotice("registration_closed"),
        getOfflineAuthNotice("login"),
      ),
    ).toEqual(getOfflineAuthNotice("login"));
  });
});
