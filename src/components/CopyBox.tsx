import { CopyButton } from './CopyButton';

export function CopyBox(props: {
  title: string;
  content: string;
  className?: string;
}) {
  return (
    <div className={`flex rounded-md shadow-sm max-w-lg ${props.className}`}>
      <input
        title={props.title}
        type='text'
        value={props.content}
        readOnly
        className='block w-full text-sm rounded-none rounded-l-md border-0 py-1.5 px-2 truncate text-muted-foreground bg-background font-mono tracking-tight ring-1 ring-inset ring-neutral-200 dark:ring-neutral-800 sm:leading-6'
      />
      <CopyButton
        value={props.content}
        className='relative rounded-none -ml-px inline-flex items-center gap-x-1.5 rounded-r-md px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-neutral-200 dark:ring-neutral-800 hover:bg-gray-50'
      />
    </div>
  );
}