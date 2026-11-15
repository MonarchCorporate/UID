import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Resolve the internal detail route for a catalog reference.
 *
 *   commodity:*  → /materialien/$ref
 *   any other    → /items/$ref (covers uex items, wiki FPS items, and — via
 *                   the shared item-catalog — wiki-registered components)
 *
 * Returns `null` when the ref is missing so callers can render plain text.
 */
export function resolveItemDetail(
  item_ref: string | null | undefined,
): { to: "/materialien/$ref" | "/items/$ref"; params: { ref: string } } | null {
  if (!item_ref) return null;
  if (item_ref.startsWith("commodity:")) {
    return { to: "/materialien/$ref", params: { ref: item_ref } };
  }
  return { to: "/items/$ref", params: { ref: item_ref } };
}

type Props = {
  item_ref: string | null | undefined;
  name: string;
  className?: string;
  title?: string;
};

/**
 * Renders the item name as a link to the appropriate detail page, or as
 * plain text when no ref is available.
 */
export function ItemLink({ item_ref, name, className, title }: Props) {
  const target = resolveItemDetail(item_ref);
  if (!target) {
    return (
      <span className={className} title={title}>
        {name}
      </span>
    );
  }
  return (
    <Link
      to={target.to}
      params={target.params}
      className={cn("hover:text-brand hover:underline", className)}
      title={title ?? `Details zu ${name}`}
    >
      {name}
    </Link>
  );
}