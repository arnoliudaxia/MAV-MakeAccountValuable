import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, Tag } from "lucide-react";
import { useNavigate } from "react-router";
import { CategoryIcon } from "@/lib/category-icons";
import type { Tag as TagRecord } from "../../../contracts/tag";

interface TagSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TagSelector({ value, onChange }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const { data: tags } = trpc.tag.list.useQuery();
  const navigate = useNavigate();

  const selectedTag = tags?.find(t => t.name === value);
  const topLevelTags =
    tags?.filter(
      tag =>
        !tag.parentId || !tags.some(candidate => candidate.id === tag.parentId)
    ) ?? [];
  const childrenByParent = new Map<string, TagRecord[]>();
  tags?.forEach(tag => {
    if (!tag.parentId) return;
    childrenByParent.set(tag.parentId, [
      ...(childrenByParent.get(tag.parentId) ?? []),
      tag,
    ]);
  });

  const renderTagItem = (tag: TagRecord, isChild = false) => (
    <CommandItem
      key={tag.id}
      value={tag.name}
      onSelect={() => {
        onChange(tag.name);
        setOpen(false);
      }}
      className={cn("flex items-center gap-2", isChild && "pl-6")}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
          value === tag.name ? "opacity-100" : "opacity-70"
        )}
        style={{
          borderColor: tag.color,
          backgroundColor: `${tag.color}18`,
          color: tag.color,
        }}
      >
        <CategoryIcon name={tag.icon} className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1">{tag.name}</span>
      {value === tag.name && (
        <div className="w-2 h-2 rounded-full bg-primary" />
      )}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selectedTag ? (
            <div className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-md"
                style={{
                  backgroundColor: `${selectedTag.color}18`,
                  color: selectedTag.color,
                }}
              >
                <CategoryIcon name={selectedTag.icon} className="h-3.5 w-3.5" />
              </span>
              <span>{selectedTag.name}</span>
            </div>
          ) : value ? (
            <span>{value}</span>
          ) : (
            <span className="text-muted-foreground">选择分类...</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" portal={false}>
        <Command>
          <CommandInput placeholder="搜索分类..." />
          <CommandList>
            <CommandEmpty>
              <div className="py-2 text-center">
                <p className="text-sm text-muted-foreground">未找到分类</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 gap-1 text-xs"
                  onClick={() => {
                    setOpen(false);
                    navigate("/tags");
                  }}
                >
                  <Plus className="h-3 w-3" />
                  去创建分类
                </Button>
              </div>
            </CommandEmpty>
            {topLevelTags.map(tag => {
              const children = childrenByParent.get(tag.id) ?? [];
              return (
                <CommandGroup
                  key={tag.id}
                  heading={children.length > 0 ? tag.name : undefined}
                >
                  {renderTagItem(tag)}
                  {children.map(child => renderTagItem(child, true))}
                </CommandGroup>
              );
            })}
            {tags && tags.length > 0 && (
              <div className="border-t p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-1 text-xs text-muted-foreground"
                  onClick={() => {
                    setOpen(false);
                    navigate("/tags");
                  }}
                >
                  <Tag className="h-3 w-3" />
                  管理分类
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
