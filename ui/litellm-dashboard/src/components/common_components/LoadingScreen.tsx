import { PRODUCT_NAME, PRODUCT_LOGO } from "@/lib/branding";
import { cx } from "@/lib/cva.config";
import { UiLoadingSpinner } from "../ui/ui-loading-spinner";

export default function LoadingScreen() {
  return (
    <div className={cx("h-screen", "flex flex-wrap items-center justify-center gap-4 px-4")}>
      <div className="flex items-center gap-2 border-r border-border py-2 pr-4 text-sm font-medium">
        <img src={PRODUCT_LOGO} alt="Semantier" width={28} height={28} />
        <span className="max-w-40">{PRODUCT_NAME}</span>
      </div>

      <div className="flex items-center justify-center gap-2">
        <UiLoadingSpinner className="size-4" />
        <span className="text-muted-foreground text-sm">Loading...</span>
      </div>
    </div>
  );
}
