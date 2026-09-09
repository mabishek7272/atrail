import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Role = "GOD" | "DEVELOPER" | "RESELLER_SUPER_ADMIN" | "ADMIN" | "ELITE" | "USER" | "INTERN";

export type FeatureFlags = {
  projects: boolean; tasks: boolean; kanban: boolean; calendar: boolean;
  chat: boolean; notices: boolean; attendance: boolean; hr: boolean;
  assets: boolean; licenses: boolean; finance: boolean; renewals: boolean;
  customers: boolean; commissions: boolean; analytics: boolean;
  emergency: boolean; documents: boolean; integrations: boolean;
  aiAssistant: boolean; telegram: boolean;
};

export const ALL_FEATURES_ON: FeatureFlags = {
  projects: true, tasks: true, kanban: true, calendar: true, chat: true,
  notices: true, attendance: true, hr: true, assets: true, licenses: true,
  finance: true, renewals: true, customers: true, commissions: true,
  analytics: true, emergency: true, documents: true, integrations: true,
  aiAssistant: true, telegram: true,
};

type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  twoFactorEnabled?: boolean;
  externalReminders?: boolean;
  fcmToken?: string;
  organizationId?: string;
  organization?: { id: string; name: string };
  accessibleOrgs?: { organizationId: string; organization: { id: string; name: string } }[];
};

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  featureFlags: FeatureFlags;
  setAuth: (accessToken: string, user: AuthUser) => void;
  setFeatureFlags: (flags: FeatureFlags) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      featureFlags: ALL_FEATURES_ON,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      setFeatureFlags: (featureFlags) => set({ featureFlags }),
      clear: () => set({ accessToken: null, user: null, featureFlags: ALL_FEATURES_ON }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      // Persist accessToken so org-switch survives page reload
      partialize: (state) => ({ user: state.user, featureFlags: state.featureFlags, accessToken: state.accessToken }),
    }
  )
);
