export function buildSessionUser(authUser, profileData = {}) {
  if (!authUser && !profileData) {
    return null;
  }

  return {
    uid: authUser?.uid ?? profileData?.uid ?? null,
    phoneNumber: authUser?.phoneNumber ?? profileData?.phoneNumber ?? "",
    email: authUser?.email ?? profileData?.email ?? "",
    displayName: authUser?.displayName ?? profileData?.displayName ?? "",
    ...profileData,
  };
}
