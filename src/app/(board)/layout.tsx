import { BoardBodyAttribute } from "@/components/board/BoardBodyAttribute";

/**
 * Shared chrome for every board surface.
 *
 * A route group rather than a path segment, so it can wrap the pairing screen at
 * "/setup" and the boards at "/board/<floor>" without adding a segment to either
 * URL. The board's own URL is what gets bookmarked on a tablet's home screen, so
 * it stays short enough to read out over the phone.
 */
export default function BoardLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <BoardBodyAttribute />
      <main className="flex h-dvh w-full flex-col overflow-hidden">{children}</main>
    </>
  );
}
