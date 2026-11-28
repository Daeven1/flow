// The isolated fixture exercises the real authenticated workspace with one fictional owner.
export const fictionalOwner = "fictional-focus-gardener";
const signedOutKey = "fictional-focus-garden-signed-out";

export function currentOwner() {
  return localStorage.getItem(signedOutKey) === "yes" ? null : fictionalOwner;
}

// These two exports stand in for the Nav's server actions.
export async function accountEmail() {
  return currentOwner() ? "gardener@example.invalid" : null;
}

export async function signOutOfGrove() {
  localStorage.setItem(signedOutKey, "yes");
  return true;
}

export function reopenSample() {
  localStorage.removeItem(signedOutKey);
  location.replace("/focus");
}
