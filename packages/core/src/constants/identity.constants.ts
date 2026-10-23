/** Identity types issued by the Authentication Service. Kept in sync with auth-service. */
export const IDENTITY_TYPES = {
  STUDENT: "student",
  SCHOOL_STAFF: "school_staff",
  PLATFORM_ADMIN: "platform_admin",
  RTA_OFFICIAL: "rta_official",
} as const;

export type IdentityType = (typeof IDENTITY_TYPES)[keyof typeof IDENTITY_TYPES];

export const IDENTITY_TYPE_VALUES = Object.values(IDENTITY_TYPES) as [IdentityType, ...IdentityType[]];
