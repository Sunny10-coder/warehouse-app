import axios, { AxiosError, AxiosInstance } from "axios";
import { storage } from "@/src/utils/storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "wh_access_token";

export const api: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const saveToken = (token: string) => storage.secureSet(TOKEN_KEY, token);
export const clearToken = () => storage.secureRemove(TOKEN_KEY);
export const getToken = () => storage.secureGet<string>(TOKEN_KEY, "");
export const getBackendBaseUrl = () => BASE_URL;

export const errMsg = (e: unknown): string => {
  const ax = e as AxiosError<any>;
  if (ax?.response?.data) {
    const d = ax.response.data;
    if (typeof d === "string") return d;
    if (typeof d.detail === "string") return d.detail;
    if (d.detail?.message) return d.detail.message;
    if (d.detail?.error) return d.detail.error;
    return JSON.stringify(d.detail ?? d);
  }
  if (ax?.message) return ax.message;
  return "Something went wrong";
};
