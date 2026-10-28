import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { settingsApi } from "@/lib/api/settings";
import type { Settings } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { SettingsBlock, SettingsCard, SettingsRow } from "./SettingsLayout";

export function DshSettings({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (updates: Partial<Settings>) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [directory, setDirectory] = useState(settings.dshConfigDir ?? "");
  const [profile, setProfile] = useState(settings.dshProfile ?? "web");
  const [saving, setSaving] = useState(false);
  const { data: info, error } = useQuery({
    queryKey: ["dsh", "info", settings.dshConfigDir, settings.dshProfile],
    queryFn: settingsApi.getDshInfo,
  });
  const { data: backups } = useQuery({
    queryKey: ["dsh", "backups", settings.dshConfigDir, settings.dshProfile],
    queryFn: settingsApi.listDshBackups,
  });
  useEffect(() => {
    setDirectory(settings.dshConfigDir ?? "");
    setProfile(settings.dshProfile ?? "web");
  }, [settings.dshConfigDir, settings.dshProfile]);
  const dirty =
    directory.trim() !== (settings.dshConfigDir ?? "") ||
    profile !== (settings.dshProfile ?? "web");
  const run = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (failure) {
      toast.error(String(failure));
    }
  };
  return (
    <SettingsBlock id="app-config-dsh" title="DeepSeek Harness">
      <SettingsCard>
        <SettingsRow label={t("dsh.profile")}>
          <select
            aria-label={t("dsh.profile")}
            value={profile}
            disabled={saving}
            className="rounded-control border border-border bg-surface px-3 py-1 text-sm"
            onChange={(event) =>
              setProfile(event.target.value as "web" | "desktop")
            }
          >
            <option value="web">Web</option>
            <option value="desktop">Desktop</option>
          </select>
        </SettingsRow>
        <SettingsRow label={t("dsh.dataDirectory")}>
          <div className="flex w-full items-center gap-2">
            <Input
              aria-label={t("dsh.dataDirectory")}
              value={directory}
              disabled={saving}
              placeholder={info?.defaultHome ?? "~/.dsh"}
              onChange={(event) => setDirectory(event.target.value)}
            />
            <Button
              variant="neutral"
              size="compact"
              disabled={saving}
              onClick={() =>
                void run(async () => {
                  const path = await settingsApi.pickDirectory(
                    directory || info?.home,
                  );
                  if (path) setDirectory(path);
                })
              }
            >
              {t("settings.browseDirectory")}
            </Button>
            <Button
              variant="quiet"
              size="compact"
              disabled={saving}
              onClick={() => setDirectory("")}
            >
              {t("settings.resetDefault")}
            </Button>
          </div>
        </SettingsRow>
        <div className="space-y-2 px-4 pb-4 text-caption text-fg-2">
          <p>{t("dsh.profileHelp")}</p>
          {info && <p className="break-all font-mono">{info.configPath}</p>}
          {error && <p role="alert">{String(error)}</p>}
          <div className="flex gap-2">
            {dirty && (
              <Button
                size="compact"
                disabled={saving}
                onClick={() =>
                  void run(async () => {
                    setSaving(true);
                    try {
                      await onSave({
                        dshConfigDir: directory.trim() || undefined,
                        dshProfile: profile,
                      });
                    } finally {
                      setSaving(false);
                    }
                  })
                }
              >
                {t("common.save")}
              </Button>
            )}
            {info?.desktop && (
              <Button
                variant="neutral"
                size="compact"
                onClick={() => void run(() => settingsApi.openDshDesktop())}
              >
                {t("dsh.openDesktop")}
                {info.desktop.version ? ` · ${info.desktop.version}` : ""}
              </Button>
            )}
            <Button
              variant="quiet"
              size="compact"
              onClick={() =>
                void run(() => settingsApi.openConfigFolder("dsh"))
              }
            >
              {t("dsh.openConfig")}
            </Button>
          </div>
          {!!backups?.length && (
            <details>
              <summary>{t("dsh.backups")}</summary>
              <ul className="space-y-2 pt-2">
                {backups.map((backup) => (
                  <li
                    key={backup.filename}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-mono">
                      {backup.filename}
                    </span>
                    <Button
                      variant="neutral"
                      size="compact"
                      disabled={saving}
                      onClick={() => {
                        if (!window.confirm(t("dsh.restoreConfirm"))) return;
                        void run(async () => {
                          setSaving(true);
                          try {
                            await settingsApi.restoreDshBackup(backup.filename);
                            await queryClient.invalidateQueries();
                          } finally {
                            setSaving(false);
                          }
                        });
                      }}
                    >
                      {t("dsh.restore")}
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </SettingsCard>
    </SettingsBlock>
  );
}
