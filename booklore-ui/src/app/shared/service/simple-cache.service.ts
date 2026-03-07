import Dexie from "dexie";
import { inject, Injectable, DestroyRef } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  HttpClient,
  HttpErrorResponse,
  HttpResponse,
} from "@angular/common/http";
import { Observable, firstValueFrom, timer } from "rxjs";

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
  static readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  static readonly MAX_ENTRIES = 1000; // Maximum number of cache entries
  static readonly MAX_SIZE_IN_MB = 200;
  private static readonly TABLE_NAME = "simpleCache";

  private http = inject(HttpClient);

  private db: Dexie;
  private cron: Observable<number>;

  constructor() {
    this.db = new Dexie("SimpleCacheDB");
    this.db.version(1).stores({
      simpleCache: "uri",
    });

    // Schedule periodic cleanup of expired entries
    this.cron = timer(0, SimpleCacheService.CLEANUP_INTERVAL);
    this.cron.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      this.cleanUpTimedOutEntries();
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
        ttl: SimpleCacheService.DEFAULT_TTL,
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
      console.error("Error cleaning up expired cache entries:", error);
    }
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
}
