import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import DOMPurify from "dompurify";
import { Bold, Italic, List, ListOrdered, Heading2, Quote, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PROSE = "rt-content text-sm text-muted-foreground";

export function sanitizeHtml(html: string) {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "s", "u", "ul", "ol", "li", "h2", "h3", "blockquote", "code", "pre", "a", "hr"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}

/** Renders stored description content. Falls back to plain text for legacy entries. */
export function RichText({ content, className }: { content: string | null | undefined; className?: string }) {
  const html = useMemo(() => {
    if (!content) return "";
    const looksLikeHtml = /<\/?(p|ul|ol|li|h2|h3|strong|em|blockquote|br)\b/i.test(content);
    if (!looksLikeHtml) {
      return content
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br />")}</p>`)
        .join("");
    }
    return sanitizeHtml(content);
  }, [content]);

  if (!html) return null;
  return <div className={cn(PROSE, className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

type ToolButtonProps = {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
};

function ToolButton({ active, onClick, label, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center border border-transparent text-muted-foreground transition hover:border-brand/30 hover:text-brand",
        active && "border-brand/40 bg-brand/10 text-brand",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content: value || "",
    editorProps: {
      attributes: {
        class: cn(PROSE, "min-h-[140px] px-4 py-3 focus:outline-none"),
        "data-placeholder": placeholder ?? "",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Sync external value changes (e.g. async loaded mission)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || "";
    if (next !== current && !(next === "" && current === "<p></p>")) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  if (!editor) {
    return <div className={cn("min-h-[180px] border border-brand/20 bg-background/50", className)} />;
  }

  return (
    <div className={cn("border border-brand/20 bg-background/50 focus-within:border-brand", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-brand/10 p-1">
        <ToolButton label="Fett" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Kursiv" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Überschrift"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Liste" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Nummerierte Liste"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Zitat" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolButton>
        <div className="ml-auto flex">
          <ToolButton label="Rückgängig" onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Wiederholen" onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="h-4 w-4" />
          </ToolButton>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}