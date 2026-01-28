import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxItemProps,
  ListBoxProps
} from 'react-aria-components';
import { cn } from "@/lib/utils"

export function ListBox<T extends object>(
  { className, children, ...props }: ListBoxProps<T>
) {
  return (
    <AriaListBox
      className={cn("border overflow-auto rounded-sm bg-background outline-none focus-visible:outline-2 focus-visible:-outline-offset-1",
        className
      )}
      {...props}>
      {children}
    </AriaListBox>
  );
}

export function ListBoxItem(props: ListBoxItemProps) {
  return <AriaListBoxItem {...props}
    className={cn("indent-1 relative flex-col m-0.5 p-0.25 rounded-md cursor-default text-sm outline:none text-foreground selected:bg-primary selected:text-primary-foreground selected:data-[focus-visible]:outline-primary selected:data-[focus-visible]:-outline-offset-4 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-2 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-primary focus:outline-2 focus:-outline-offset-2 hover:bg-secondary/90",
    )}
  />;
}

