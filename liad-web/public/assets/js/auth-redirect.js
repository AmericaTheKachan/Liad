import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirebaseServices } from "./firebase-client.js";
import { getCurrentAccountContext, storePendingProfile } from "./auth-data.js";
import { splitDisplayName } from "./validators.js";

export function redirectToDashboard() {
  window.location.assign("/dashboard");
}

export function redirectToLogin() {
  window.location.assign("/login");
}

export function redirectToCompleteProfile() {
  window.location.assign("/completar-cadastro");
}

export async function resolveRouteForUser(user) {
  const context = await getCurrentAccountContext(user);

  if (context?.account && context?.userProfile?.accountId) {
    return "dashboard";
  }

  storePendingProfile({
    email: user.email ?? "",
    ...splitDisplayName(user.displayName ?? "")
  });

  return "complete-profile";
}

export async function redirectAuthenticatedUser(user) {
  const target = await resolveRouteForUser(user);

  if (target === "dashboard") {
    redirectToDashboard();
    return;
  }

  redirectToCompleteProfile();
}

export async function requireGuest() {
  const { auth } = await getFirebaseServices();

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();

      if (user) {
        await redirectAuthenticatedUser(user);
      } else {
        resolve();
      }
    });
  });
}

export async function requireAuthenticated() {
  const { auth } = await getFirebaseServices();

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();

      if (!user) {
        redirectToLogin();
        return;
      }

      resolve(user);
    });
  });
}
