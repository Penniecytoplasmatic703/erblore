import { Injectable } from "@angular/core";

export interface LocalSettings {
  simpleCacheEnabled: boolean;
  simpleCacheMaxEntries: number;
  simpleCacheMaxSizeMB: number;
  simpleCacheTtlHours: number;
  simpleCacheCleanupIntervalMinutes: number;
}

const keys = [
  "simpleCacheEnabled",
  "simpleCacheMaxEntries",
  "simpleCacheMaxSizeMB",
  "simpleCacheTtlHours",
  "simpleCacheCleanupIntervalMinutes",
] as const;

@Injectable({
  providedIn: "root",
})
export class LocalSettingsService {
  public readonly storagePrefix = "booklore_";

  public readonly defaultSettings: LocalSettings = {
    simpleCacheEnabled: true,
    simpleCacheMaxEntries: 200,
    simpleCacheMaxSizeMB: 256,
    simpleCacheTtlHours: 24,
    simpleCacheCleanupIntervalMinutes: 10,
  };

  protected settings: LocalSettings;

  constructor() {
    this.settings = { ...this.defaultSettings };

    // Load settings from localStorage on initialization
    this.repairSettings();
    this.loadSettings();
  }

  get(): LocalSettings {
    return this.settings;
  }

  loadSettings(): void {
    const settings = this.getSettingsFromLocalStorage();
    if (settings) {
      this.whatever(settings);
    } else {
      this.whatever(this.defaultSettings);
      this.commitToLocalStorage(this.settings);
    }
  }

  commitSettings(): void {
    this.commitToLocalStorage(this.settings);
  }

  private whatever(settings: LocalSettings): void {
    for (const key of keys) {
      this.settings[key] = settings[key] as never;
    }
  }

  private getSettingsFromLocalStorage(): LocalSettings | null {
    try {
      const stored = localStorage.getItem(`${this.storagePrefix}settings`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Partial<
            LocalSettings & { simpleCacheTtlMinutes?: number }
          >;

          if (
            parsed.simpleCacheTtlHours == null &&
            Number.isFinite(parsed.simpleCacheTtlMinutes)
          ) {
            parsed.simpleCacheTtlHours = Math.max(
              1,
              Math.ceil((parsed.simpleCacheTtlMinutes as number) / 60),
            );
          }

          return { ...this.defaultSettings, ...parsed };
        } catch (error) {
          console.error("Failed to parse local settings:", error);
          return null;
        }
      }
      return null;
    } catch (error) {
      console.error("Error getting local settings:", error);
      return null;
    }
  }

  private commitToLocalStorage(settings: LocalSettings): boolean {
    try {
      localStorage.setItem(
        `${this.storagePrefix}settings`,
        JSON.stringify(settings),
      );
      return true;
    } catch (error) {
      console.error("Failed to save local settings:", error);
      return false;
    }
  }

  private repairSettings(): void {
    const s = this.getSettingsFromLocalStorage();
    if (s) {
      this.commitToLocalStorage(s);
    } else {
      this.commitToLocalStorage(this.defaultSettings);
    }
  }
}
