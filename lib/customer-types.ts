export type CustomerPreferences = {
  emailStatusUpdates: boolean;
  showQueuePosition: boolean;
};

export type CustomerAccount = {
  id: string;
  email: string;
  displayName: string;
  passwordSalt: string;
  passwordHash: string;
  emailVerifiedAt: string;
  sessionVersion: number;
  preferences: CustomerPreferences;
  createdAt: string;
  updatedAt: string;
};

export type CustomerNotification = {
  id: string;
  customerId: string;
  requestId: string;
  requestCode: string;
  message: string;
  createdAt: string;
  readAt: string;
};

export type CustomerSessionView = Pick<CustomerAccount, "id" | "email" | "displayName" | "emailVerifiedAt" | "preferences"> & {
  emailVerified: boolean;
};
