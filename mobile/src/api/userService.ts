import { axiosInstance } from './axiosInstance';

export interface UserProfileResponse {
  id: string;
  email: string;
  displayName: string;
  virtualBalance: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  timezoneOffsetMinutes: number;
  deviceToken: string | null;
  notificationsEnabled: boolean;
}

export interface NotificationSettingsResponse {
  deviceToken: string | null;
  timezoneOffsetMinutes: number;
  notificationsEnabled: boolean;
}

export const fetchUserProfile = async (): Promise<UserProfileResponse> => {
  const { data } = await axiosInstance.get('/account/me');
  return data.data; // { data: { id, email, ... }, error: null }
};

export const updateTimezone = async (timezoneOffsetMinutes: number): Promise<NotificationSettingsResponse> => {
  const { data } = await axiosInstance.patch('/notification-settings/timezone', { timezoneOffsetMinutes });
  return data.data;
};

export const registerDeviceToken = async (deviceToken: string): Promise<NotificationSettingsResponse> => {
  const { data } = await axiosInstance.put('/notification-settings/device-token', { deviceToken });
  return data.data;
};

export const removeDeviceToken = async (): Promise<void> => {
  await axiosInstance.delete('/notification-settings/device-token');
};

export const updateNotificationPreferences = async (enabled: boolean): Promise<NotificationSettingsResponse> => {
  const { data } = await axiosInstance.patch('/notification-settings/preferences', { enabled });
  return data.data;
};
