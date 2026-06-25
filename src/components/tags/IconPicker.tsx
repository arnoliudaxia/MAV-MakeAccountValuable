import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CATEGORY_ICON_OPTIONS, CategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  value?: string;
  onChange: (value: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedIcon = value || "Tag";
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = CATEGORY_ICON_OPTIONS.filter(option => {
    if (!normalizedQuery) return true;
    return option.searchText.toLowerCase().includes(normalizedQuery);
  }).slice(0, 10);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <CategoryIcon name={selectedIcon} className="h-4 w-4 shrink-0" />
            <span className="truncate">{selectedIcon}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(520px,calc(100vw-3rem))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="搜索图标，例如：餐饮、交通、cloud..."
          />
          <CommandList className="max-h-80">
            {visibleOptions.length === 0 ? (
              <CommandEmpty>未找到图标</CommandEmpty>
            ) : (
              <CommandGroup>
                {visibleOptions.map(({ name, searchText, keywords }) => (
                  <CommandItem
                    key={name}
                    value={searchText}
                    onSelect={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <CategoryIcon name={name} className="h-4 w-4" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{name}</span>
                      {keywords ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {keywords}
                        </span>
                      ) : null}
                    </span>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        selectedIcon === name ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
