import Dexie from "dexie";
import { inject, Injectable, DestroyRef } from "@angular/core";
import {
  HttpClient,
  HttpErrorResponse,
  HttpResponse,
} from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { LocalSettingsService } from "./local-settings.service";

export interface SimpleCacheEntry {
  uri: string;
  lastModified: Date;
  data: Blob;
  lastAccessed: Date;
  ttl: number; // Time to live in milliseconds
}

@Injectable({
  providedIn: "root",
})
export class SimpleCacheService {
  static readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
  static readonly DEFAULT_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
  static readonly MIN_CLEANUP_INTERVAL = 60 * 1000; // 1 minute
  static readonly MAX_ENTRIES = 200; // Maximum number of cache entries
  static readonly MAX_DATA_SIZE_IN_BYTES = 256 * 1024 * 1024; // 256 MB
  private static readonly TABLE_NAME = "simpleCache";

  private http = inject(HttpClient);
  private localSettingsService = inject(LocalSettingsService);
  private destroyRef = inject(DestroyRef);

  private db: Dexie;
  private cleanupTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.db = new Dexie("SimpleCacheDB");
    this.db.version(1).stores({
      simpleCache: "uri, lastAccessed",
    });

    // Run cleanup immediately on startup and continue using configured interval.
    void this.runCleanup();
    this.scheduleCleanup();

    this.destroyRef.onDestroy(() => {
      this.clearCleanupTimer();
    });
  }

  async getCache(uri: string, noValidate: boolean = false): Promise<Blob> {
    try {
      let stale: boolean = true;
      const entry = await this.table().get({ uri });
      if (entry) {
        stale = false;
        this.updateLastAccessed(entry);
        if (!noValidate) stale = !(await this.validateCacheFromUri(entry));
      }

      if (!stale)
        //@ts-ignore
        return entry.data;

      const response = await this.fetchFromUri(uri);
      const body = response.body;
      const lastModified = response.headers.get("last-modified")
        ? //@ts-ignore
          new Date(response.headers.get("last-modified"))
        : new Date();

      if (!body) return new Blob(); // Not sure you you get there

      const fetchedEntry = {
        uri,
        data: body,
        lastModified: lastModified,
        lastAccessed: new Date(),
        ttl: this.getEntryTtl(),
      };
      await this.addCache(fetchedEntry);
      return fetchedEntry.data;
    } catch (error) {
      console.error("Error retrieving cache:", error);
      return new Blob(); // Not sure you you get there
    }
  }

  async existCache(uri: string): Promise<boolean> {
    return !!(await this.table().get({ uri }));
  }

  async addCache(entry: SimpleCacheEntry): Promise<void> {
    try {
      if (await this.existCache(entry.uri)) {
        await this.table().update(entry.uri, entry);
      } else {
        await this.table().put(entry);
      }
    } catch (error) {
      console.error("Error caching:", error);
    }
  }

  async deleteCache(uri: string): Promise<void> {
    try {
      await this.table().delete(uri);
    } catch (error) {
      console.error("Error deleting cache:", error);
    }
  }

  async clearCache(): Promise<void> {
    try {
      await this.table().clear();
    } catch (error) {
      console.error("Error clearing cache:", error);
    }
  }

  async cleanUpTimedOutEntries(): Promise<void> {
    try {
      const entries = await this.table().toArray();
      for (const entry of entries) {
        await this.deleteIfTimedOut(entry);
      }
    } catch (error) {
      console.error("Error cleaning up timed out cache entries:", error);
    }
  }

  async cleanUpExcessEntries(): Promise<void> {
    try {
      // Max entries cleanup
      const count = await this.table().count();
      if (count > SimpleCacheService.MAX_ENTRIES) {
        await this.table()
          .orderBy("lastAccessed") // Ascending order, least recently accessed first
          .limit(count - SimpleCacheService.MAX_ENTRIES)
          .delete();
      }

      // Max data size cleanup
      const dataSizes = await this.getDataSizes();
      let totalSize = dataSizes.reduce((acc, entry) => acc + entry.size, 0);

      if (totalSize > SimpleCacheService.MAX_DATA_SIZE_IN_BYTES) {
        dataSizes.sort(
          (a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime(),
        );
        const excessSize =
          totalSize - SimpleCacheService.MAX_DATA_SIZE_IN_BYTES;
        let deletedSize = 0;
        for (const { uri, size } of dataSizes) {
          if (deletedSize >= excessSize) break;
          await this.deleteCache(uri);
          deletedSize += size;
        }
      }
    } catch (error) {
      console.error("Error cleaning up excess cache entries:", error);
    }
  }

  async runCleanup(): Promise<void> {
    await this.cleanUpTimedOutEntries();
    await this.cleanUpExcessEntries();
  }

  async getCacheSizeInBytes(): Promise<number> {
    const dataSizes = await this.getDataSizes();
    return dataSizes.reduce((acc, entry) => acc + entry.size, 0);
  }

  private async getDataSizes(): Promise<
    Array<{ uri: string; size: number; lastAccessed: Date }>
  > {
    const entries = await this.table().toArray();
    const sizes = entries.map((entry) => ({
      uri: entry.uri,
      size: entry.data.size,
      lastAccessed: entry.lastAccessed,
    }));
    return sizes;
  }

  private table(): Dexie.Table<SimpleCacheEntry, string> {
    return this.db.table(SimpleCacheService.TABLE_NAME);
  }

  private async fetchFromUri(uri: string): Promise<HttpResponse<Blob>> {
    return firstValueFrom(
      this.http.get<Blob>(uri, {
        responseType: "blob" as "json",
        observe: "response",
      }),
    );
  }

  private async validateCacheFromUri(
    entry: SimpleCacheEntry,
  ): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.head<Blob>(entry.uri, {
          observe: "response",
          responseType: "blob" as "json",
          headers: {
            "if-modified-since": entry.lastModified.toUTCString(),
          },
        }),
      );

      return response.status === 304;
    } catch (error: HttpErrorResponse | any) {
      if (error instanceof HttpErrorResponse && error.status === 304) {
        return true; // Not modified, cache is valid
      }
      console.error("Error validating cache:", error);
      return false;
    }
  }

  private async updateLastAccessed(entry: SimpleCacheEntry): Promise<void> {
    try {
      entry.lastAccessed = new Date();
      await this.table().update(entry.uri, entry);
    } catch (error) {
      console.error("Error updating last accessed time:", error);
    }
  }

  private async deleteIfTimedOut(
    entry: SimpleCacheEntry,
  ): Promise<SimpleCacheEntry | null> {
    if (this.isTimedOut(entry)) {
      await this.deleteCache(entry.uri);
      return null;
    }
    return entry;
  }

  private isTimedOut(entry: SimpleCacheEntry): boolean {
    return Date.now() > entry.lastAccessed.getTime() + entry.ttl;
  }

  private getEntryTtl(): number {
    const ttlHours = this.localSettingsService.get().simpleCacheTtlHours;
    if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
      return SimpleCacheService.DEFAULT_TTL;
    }

    return ttlHours * 60 * 60 * 1000;
  }

  private getCleanupIntervalMs(): number {
    const cleanupIntervalMinutes =
      this.localSettingsService.get().simpleCacheCleanupIntervalMinutes;
    if (
      !Number.isFinite(cleanupIntervalMinutes) ||
      cleanupIntervalMinutes <= 0
    ) {
      return SimpleCacheService.DEFAULT_CLEANUP_INTERVAL;
    }

    const intervalMs = cleanupIntervalMinutes * 60 * 1000;
    return Math.max(SimpleCacheService.MIN_CLEANUP_INTERVAL, intervalMs);
  }

  private scheduleCleanup(): void {
    this.clearCleanupTimer();

    this.cleanupTimeoutId = setTimeout(async () => {
      try {
        await this.runCleanup();
      } catch (error) {
        console.error("Error running scheduled cache cleanup:", error);
      } finally {
        this.scheduleCleanup();
      }
    }, this.getCleanupIntervalMs());
  }

  private clearCleanupTimer(): void {
    if (this.cleanupTimeoutId != null) {
      clearTimeout(this.cleanupTimeoutId);
      this.cleanupTimeoutId = null;
    }
  }
}
