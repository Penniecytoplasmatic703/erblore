import { Component, inject, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DecimalPipe } from "@angular/common";
import { Checkbox } from "primeng/checkbox";
import { InputNumber } from "primeng/inputnumber";
import { Button } from "primeng/button";
import { ConfirmationService, MessageService } from "primeng/api";
import { TranslocoDirective } from "@jsverse/transloco";
import {
  LocalSettingsService,
  LocalSettings,
} from "../../../shared/service/local-settings.service";
import { SimpleCacheService } from "../../../shared/service/simple-cache.service";

@Component({
  selector: "app-local-settings",
  imports: [
    FormsModule,
    DecimalPipe,
    Checkbox,
    InputNumber,
    Button,
    TranslocoDirective,
  ],
  templateUrl: "./local-settings.component.html",
  styleUrl: "./local-settings.component.scss",
})
export class LocalSettingsComponent implements OnInit {
  private localSettingsService = inject(LocalSettingsService);
  private simpleCacheService = inject(SimpleCacheService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  protected settings: LocalSettings = this.localSettingsService.get();

  protected isClearingSimpleCache = false;
  protected isRunningManualCleanup = false;
  protected isLoadingIndexedDbUsage = false;
  protected indexedDbUsageMb = 0;

  async ngOnInit(): Promise<void> {
    await this.loadIndexedDbUsage();
  }

  onSettingChange(): void {
    this.localSettingsService.commitSettings();
  }

  clearSimpleCache(): void {
    this.confirmationService.confirm({
      message:
        "Are you sure you want to clear all IndexedDB data? This action cannot be undone.",
      header: "Clear IndexedDB Cache",
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Clear",
      rejectLabel: "Cancel",
      acceptButtonProps: {
        label: "Clear",
        severity: "danger",
      },
      rejectButtonProps: {
        label: "Cancel",
        severity: "secondary",
      },
      accept: async () => {
        this.isClearingSimpleCache = true;
        await this.simpleCacheService.clearCache();
        await this.loadIndexedDbUsage();
        this.messageService.add({
          severity: "success",
          summary: "IndexedDB Cache Cleared",
          detail: "All IndexedDB data has been cleared successfully.",
        });
        this.isClearingSimpleCache = false;
      },
    });
  }

  async runManualCleanup(): Promise<void> {
    this.isRunningManualCleanup = true;
    try {
      await this.simpleCacheService.runCleanup();
      await this.loadIndexedDbUsage();
      this.messageService.add({
        severity: "success",
        summary: "Cleanup Completed",
        detail: "Timed out and excess cache entries were cleaned up.",
      });
    } catch (error) {
      console.error("Error running manual cache cleanup:", error);
      this.messageService.add({
        severity: "error",
        summary: "Cleanup Failed",
        detail: "Unable to complete cache cleanup.",
      });
    } finally {
      this.isRunningManualCleanup = false;
    }
  }

  async loadIndexedDbUsage(): Promise<void> {
    this.isLoadingIndexedDbUsage = true;
    try {
      const totalBytes = await this.simpleCacheService.getCacheSizeInBytes();
      this.indexedDbUsageMb = totalBytes / (1024 * 1024);
    } catch (error) {
      console.error("Error loading IndexedDB usage:", error);
      this.indexedDbUsageMb = 0;
    } finally {
      this.isLoadingIndexedDbUsage = false;
    }
  }
}
