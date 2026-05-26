import axios, { AxiosError, AxiosInstance } from "axios";
import { storage } from "@/src/utils/storage";

const RAW_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
const BASE_URL = (() => {
  if (!RAW_BASE_URL) return "";
  if (RAW_BASE_URL.startsWith("http")) return RAW_BASE_URL;
  if (RAW_BASE_URL.includes(".")) return `https://${RAW_BASE_URL}`;
  return `https://${RAW_BASE_URL}.onrender.com`;
})();
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
export const clearToken = async () => {
  await storage.secureRemove(TOKEN_KEY);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.indexedDB?.deleteDatabase("AsyncStorage");
    } catch {
      // Browser storage cleanup is best-effort; auth state still clears in memory.
    }
  }
};
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
