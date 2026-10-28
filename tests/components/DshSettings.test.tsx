import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DshSettings } from "@/components/settings/DshSettings";
import { settingsApi } from "@/lib/api/settings";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/api/settings", () => ({
  settingsApi: {
    getDshInfo: vi.fn(),
    listDshBackups: vi.fn(),
    pickDirectory: vi.fn(),
    openConfigFolder: vi.fn(),
    openDshDesktop: vi.fn(),
    restoreDshBackup: vi.fn(),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));

const info = {
  home: "D:/dsh",
  defaultHome: "D:/dsh",
  profile: "web" as const,
  configPath: "D:/dsh/profiles/web/cordis.patch.yml",
  desktop: { path: "D:/apps/DeepSeek Harness.exe", version: "0.2.1" },
};
function show(onSave = vi.fn().mockResolvedValue(true)) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DshSettings settings={{}} onSave={onSave} />
    </QueryClientProvider>,
  );
  return onSave;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(settingsApi.getDshInfo).mockResolvedValue(info);
  vi.mocked(settingsApi.listDshBackups).mockResolvedValue([]);
});
afterEach(cleanup);
describe("DSH desktop configuration", () => {
  it("keeps old settings on web and reads the native path", async () => {
    const save = show();
    expect(screen.getByRole("combobox", { name: "dsh.profile" })).toHaveValue(
      "web",
    );
    expect(await screen.findByText(info.configPath)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(settingsApi.openDshDesktop).not.toHaveBeenCalled();
  });
  it("saves the selected desktop target and trimmed data root only on Save", async () => {
    const save = show();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox"), "desktop");
    await user.type(
      screen.getByRole("textbox", { name: "dsh.dataDirectory" }),
      "  D:/isolated-dsh  ",
    );
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        dshProfile: "desktop",
        dshConfigDir: "D:/isolated-dsh",
      }),
    );
  });
  it("opens the discovered native desktop on request", async () => {
    show();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /dsh.openDesktop/ }),
    );
    expect(settingsApi.openDshDesktop).toHaveBeenCalledTimes(1);
  });
});
