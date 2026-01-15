"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./AuthContext";
import { format } from "date-fns";

// --- Types ---
export interface UserSettings {
  cals: number;
  prot: number;
  carb: number;
  fat: number;
  weight: number;
  wheyDose: number;
  wheyProt: number;
}

export interface MealEntry {
  id: string;
  name: string;
  timestamp: string;
  foods: any[]; // refined in parser
  totals: { p: number; c: number; f: number; kcal: number };
  cals: number;
  prot: number;
  carb: number;
  fat: number;
  isApproximate: boolean;
}

export interface DailyLog {
  items: MealEntry[];
  total: { cals: number; prot: number; carb: number; fat: number };
  water: number;
  updatedAt?: string;
}

interface DataContextType {
  userSettings: UserSettings;
  dailyLog: DailyLog;
  currentDate: Date;
  updateSettings: (newSettings: UserSettings) => Promise<void>;
  addMeal: (meal: Omit<MealEntry, "id"> & { id?: string }) => Promise<void>;
  addWater: (amount: number) => Promise<void>;
  changeDate: (date: Date) => void;
  deleteMeal: (mealId: string) => Promise<void>;
}

const DataContext = createContext<DataContextType>({} as DataContextType);

const DEFAULT_SETTINGS: UserSettings = {
  cals: 2100, prot: 240, carb: 180, fat: 45, weight: 93, wheyDose: 30, wheyProt: 24
};

const DEFAULT_LOG: DailyLog = {
  items: [],
  total: { cals: 0, prot: 0, carb: 0, fat: 0 },
  water: 0,
  updatedAt: new Date(0).toISOString()
};

const safeParseJson = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const ensureMealId = (meal: Partial<MealEntry>, fallbackSeed: string) => {
  const existingId = typeof meal.id === "string" ? meal.id : "";
  if (existingId) return existingId;

  const seed = `${meal.timestamp || ""}|${meal.name || ""}|${fallbackSeed}`;
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  const base = typeof globalThis.btoa === "function" ? globalThis.btoa(seed) : seed;
  return base.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || `${Date.now()}`;
};

const normalizeDailyLog = (raw: Partial<DailyLog> | null, fallbackSeed: string): DailyLog => {
  const items = (raw?.items || []).map((item, idx) => ({
    ...(item as any),
    id: ensureMealId(item as any, `${fallbackSeed}:${idx}`)
  })) as MealEntry[];

  return {
    items,
    total: raw?.total || { cals: 0, prot: 0, carb: 0, fat: 0 },
    water: raw?.water || 0,
    updatedAt: raw?.updatedAt || new Date(0).toISOString()
  };
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [dailyLog, setDailyLog] = useState<DailyLog>(DEFAULT_LOG);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Helper: Get ISO Date string for storage keys
  const getDateKey = (date: Date) => format(date, "yyyy-MM-dd");

  // --- Load Settings ---
  useEffect(() => {
    // 1. Load from LocalStorage first (Offline priority)
    const localSettings = safeParseJson<Partial<UserSettings>>(localStorage.getItem("macromixer_settings"));
    if (localSettings) setUserSettings({ ...DEFAULT_SETTINGS, ...localSettings });

    // 2. Sync with Firebase if user logged in
    if (user) {
      const unsub = onSnapshot(
        doc(db, "users", user.uid, "settings", "goals"),
        {
          next: (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserSettings;
              setUserSettings((prev) => {
                const newVal = { ...prev, ...data };
                localStorage.setItem("macromixer_settings", JSON.stringify(newVal));
                return newVal;
              });
            }
          },
          error: (error) => {
            console.warn("Settings listener failed", error);
          }
        }
      );
      return () => unsub();
    }
  }, [user]);

  // --- Load Daily Log ---
  useEffect(() => {
    const dateKey = getDateKey(currentDate);

    // 1. LocalStorage
    const localLog = safeParseJson<Partial<DailyLog>>(localStorage.getItem(`macromixer_log_${dateKey}`));
    const normalizedLocalLog = normalizeDailyLog(localLog, `local:${dateKey}`);
    setDailyLog(normalizedLocalLog);
    localStorage.setItem(`macromixer_log_${dateKey}`, JSON.stringify(normalizedLocalLog));

    // 2. Firebase
    if (user) {
      const unsub = onSnapshot(
        doc(db, "users", user.uid, "daily_logs", dateKey),
        {
          next: (docSnap) => {
            if (docSnap.exists()) {
              const remote = normalizeDailyLog(docSnap.data() as DailyLog, `remote:${dateKey}`);
              const local = normalizeDailyLog(
                safeParseJson<Partial<DailyLog>>(localStorage.getItem(`macromixer_log_${dateKey}`)),
                `local:${dateKey}`
              );

              const remoteUpdatedAt = new Date(remote.updatedAt || 0).getTime();
              const localUpdatedAt = new Date(local.updatedAt || 0).getTime();

              if (Number.isFinite(remoteUpdatedAt) && Number.isFinite(localUpdatedAt) && remoteUpdatedAt < localUpdatedAt) {
                return;
              }

              setDailyLog(remote);
              localStorage.setItem(`macromixer_log_${dateKey}`, JSON.stringify(remote));
            }
          },
          error: (error) => {
            console.warn("Daily log listener failed", error);
          }
        }
      );
      return () => unsub();
    }
  }, [user, currentDate]);

  // --- Actions ---

  const updateSettings = async (newSettings: UserSettings) => {
    setUserSettings(newSettings);
    localStorage.setItem("macromixer_settings", JSON.stringify(newSettings));
    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid, "settings", "goals"), newSettings);
      } catch (error) {
        console.error("Failed to sync settings", error);
      }
    }
  };

  const addMeal = async (meal: Omit<MealEntry, "id"> & { id?: string }) => {
    const dateKey = getDateKey(currentDate);

    const safeMeal: MealEntry = {
      ...(meal as any),
      id: ensureMealId(meal as any, `add:${dateKey}`),
      cals: Number.isFinite(meal.cals) ? meal.cals : 0,
      prot: Number.isFinite(meal.prot) ? meal.prot : 0,
      carb: Number.isFinite(meal.carb) ? meal.carb : 0,
      fat: Number.isFinite(meal.fat) ? meal.fat : 0
    };

    let nextLog: DailyLog | null = null;
    setDailyLog((prev) => {
      const prevItems = prev.items || [];
      const prevTotal = prev.total || { cals: 0, prot: 0, carb: 0, fat: 0 };

      const nowIso = new Date().toISOString();

      const newItems = [...prevItems, safeMeal];
      const newTotal = {
        cals: prevTotal.cals + safeMeal.cals,
        prot: prevTotal.prot + safeMeal.prot,
        carb: prevTotal.carb + safeMeal.carb,
        fat: prevTotal.fat + safeMeal.fat
      };

      nextLog = { ...prev, items: newItems, total: newTotal, updatedAt: nowIso };
      return nextLog;
    });

    if (nextLog) localStorage.setItem(`macromixer_log_${dateKey}`, JSON.stringify(nextLog));

    if (user && nextLog) {
      try {
        await setDoc(doc(db, "users", user.uid, "daily_logs", dateKey), nextLog, { merge: true });
      } catch (error) {
        console.error("Failed to sync daily log", error);
      }
    }
  };

  const deleteMeal = async (mealId: string) => {
    const dateKey = getDateKey(currentDate);

    let nextLog: DailyLog | null = null;
    let didChange = false;

    setDailyLog((prev) => {
      const prevItems = prev.items || [];
      const prevTotal = prev.total || { cals: 0, prot: 0, carb: 0, fat: 0 };

      const id = typeof mealId === "string" ? mealId : "";
      const itemToRemove = id ? prevItems.find((m) => m.id === id) : undefined;
      if (!itemToRemove) {
        nextLog = prev;
        return prev;
      }

      didChange = true;
      const newItems = prevItems.filter((m) => m.id !== itemToRemove.id);
      const nowIso = new Date().toISOString();
      const newTotal = {
        cals: Math.max(0, prevTotal.cals - (Number.isFinite(itemToRemove.cals) ? itemToRemove.cals : 0)),
        prot: Math.max(0, prevTotal.prot - (Number.isFinite(itemToRemove.prot) ? itemToRemove.prot : 0)),
        carb: Math.max(0, prevTotal.carb - (Number.isFinite(itemToRemove.carb) ? itemToRemove.carb : 0)),
        fat: Math.max(0, prevTotal.fat - (Number.isFinite(itemToRemove.fat) ? itemToRemove.fat : 0))
      };

      nextLog = { ...prev, items: newItems, total: newTotal, updatedAt: nowIso };
      return nextLog;
    });

    if (didChange && nextLog) localStorage.setItem(`macromixer_log_${dateKey}`, JSON.stringify(nextLog));

    if (user && didChange && nextLog) {
      try {
        await setDoc(doc(db, "users", user.uid, "daily_logs", dateKey), nextLog, { merge: true });
      } catch (error) {
        console.error("Failed to sync daily log", error);
      }
    }
  };

  const addWater = async (amount: number) => {
    const dateKey = getDateKey(currentDate);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    if (safeAmount === 0) return;

    setDailyLog((prev) => {
      const currentWater = Number.isFinite(prev.water) ? prev.water : 0;
      const newWater = Math.max(0, currentWater + safeAmount);
      const nowIso = new Date().toISOString();
      const nextLog: DailyLog = { ...prev, water: newWater, updatedAt: nowIso };

      queueMicrotask(async () => {
        localStorage.setItem(`macromixer_log_${dateKey}`, JSON.stringify(nextLog));

        if (!user) return;
        try {
          await setDoc(
            doc(db, "users", user.uid, "daily_logs", dateKey),
            { water: nextLog.water, updatedAt: nextLog.updatedAt },
            { merge: true }
          );
        } catch (error) {
          console.error("Failed to sync water", error);
        }
      });

      return nextLog;
    });
  };

  const changeDate = (date: Date) => {
    setCurrentDate(date);
  };

  return (
    <DataContext.Provider value={{
      userSettings,
      dailyLog,
      currentDate,
      updateSettings,
      addMeal,
      addWater,
      changeDate,
      deleteMeal
    }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
